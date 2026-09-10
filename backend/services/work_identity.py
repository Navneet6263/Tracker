"""OIDC identity verification. Provider credentials exist only on the server."""
import base64
import hashlib
import os
import secrets
from functools import lru_cache
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import HTTPException
from jose import jwt


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def provider_config(name):
    if name not in {"microsoft", "keka"}:
        raise HTTPException(404, "Unknown identity provider")
    prefix = "WORK_" + name.upper()
    issuer = os.getenv(prefix + "_ISSUER", "").rstrip("/")
    client = os.getenv(prefix + "_CLIENT_ID", "")
    secret = os.getenv(prefix + "_CLIENT_SECRET", "")
    public = os.getenv("WORK_PUBLIC_API_URL", "").rstrip("/")
    if not all([issuer, client, secret, public]):
        raise HTTPException(503, f"{name.title()} work login has not been configured")
    for url in (issuer, public):
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.query or parsed.fragment:
            raise HTTPException(503, "Work login requires HTTPS provider and callback URLs")
    if name == "microsoft" and any(x in issuer.split("/") for x in ("common", "organizations", "consumers")):
        raise HTTPException(503, "Use a company-specific Microsoft tenant issuer")
    return {"name": name, "issuer": issuer, "client_id": client, "client_secret": secret,
            "redirect_uri": public + "/work/callback/" + name}


def configured_providers():
    result = []
    for name in ("microsoft", "keka"):
        try:
            provider_config(name)
            result.append(name)
        except HTTPException:
            pass
    return result


@lru_cache(maxsize=4)
def discovery(issuer):
    with httpx.Client(timeout=12, follow_redirects=False) as client:
        response = client.get(issuer + "/.well-known/openid-configuration")
        response.raise_for_status()
        data = response.json()
    if data.get("issuer") != issuer:
        raise ValueError("OIDC issuer mismatch")
    for key in ("authorization_endpoint", "token_endpoint", "jwks_uri"):
        parsed = urlparse(data[key])
        if parsed.scheme != "https" or not parsed.hostname or parsed.username:
            raise ValueError("Invalid OIDC endpoint")
    return data


def authorize_url(config, state, verifier, nonce):
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    query = {"client_id": config["client_id"], "redirect_uri": config["redirect_uri"],
             "response_type": "code", "response_mode": "form_post", "scope": "openid profile email", "state": state,
             "nonce": nonce, "code_challenge": challenge, "code_challenge_method": "S256",
             # A shared browser must not silently reuse the previous staff member.
             "prompt": "login"}
    return discovery(config["issuer"])["authorization_endpoint"] + "?" + urlencode(query)


def verify_code(config, code, verifier, nonce):
    metadata = discovery(config["issuer"])
    with httpx.Client(timeout=12, follow_redirects=False) as client:
        response = client.post(metadata["token_endpoint"], data={
            "grant_type": "authorization_code", "code": code,
            "client_id": config["client_id"], "client_secret": config["client_secret"],
            "redirect_uri": config["redirect_uri"], "code_verifier": verifier,
        })
        response.raise_for_status()
        token = response.json()["id_token"]
        keys_response = client.get(metadata["jwks_uri"])
        keys_response.raise_for_status()
        keys = keys_response.json()
    claims = jwt.decode(token, keys, algorithms=["RS256"], audience=config["client_id"],
                        issuer=config["issuer"], options={"require_exp": True, "require_iat": True,
                                                        "require_sub": True, "verify_at_hash": False})
    if not secrets.compare_digest(str(claims.get("nonce", "")), nonce):
        raise ValueError("OIDC nonce mismatch")
    if claims.get("azp", config["client_id"]) != config["client_id"]:
        raise ValueError("OIDC authorized party mismatch")
    subject = claims["sub"]
    if config["name"] == "microsoft":
        subject = claims.get("oid")
        if not subject or not claims.get("tid") or claims["tid"] not in config["issuer"].split("/"):
            raise ValueError("Microsoft tenant or object identity missing")
    if not isinstance(subject, str) or not 1 <= len(subject) <= 255:
        raise ValueError("Invalid subject")
    return {"issuer": config["issuer"], "subject": subject,
            "name": str(claims.get("name") or "Employee")[:255]}
