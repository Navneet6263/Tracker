import time
from urllib.parse import parse_qs, urlparse

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwk, jwt
from services import work_identity as identity


@pytest.fixture
def oidc(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    config = {"name": "microsoft", "issuer": "https://login.microsoftonline.com/tenant-123/v2.0",
              "client_id": "client-123", "client_secret": "test-only", "redirect_uri": "https://tracker.example/callback"}
    metadata = {"authorization_endpoint": "https://login.example/authorize",
                "token_endpoint": "https://login.example/token", "jwks_uri": "https://login.example/keys"}
    monkeypatch.setattr(identity, "discovery", lambda issuer: metadata)
    claims = {"iss": config["issuer"], "aud": config["client_id"], "sub": "pairwise-subject",
              "oid": "stable-object-id", "tid": "tenant-123", "name": "Sonu",
              "iat": int(time.time()), "exp": int(time.time()) + 600, "nonce": "expected-nonce"}
    state = {"claims": claims, "key": key}
    class Response:
        def __init__(self, body): self.body = body
        def raise_for_status(self): pass
        def json(self): return self.body
    class Client:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, data):
            assert data["code_verifier"] == "verifier"
            return Response({"id_token": jwt.encode(state["claims"], state["key"], algorithm="RS256")})
        def get(self, url):
            return Response({"keys": [jwk.construct(key.public_key(), "RS256").to_dict()]})
    monkeypatch.setattr(identity.httpx, "Client", Client)
    return config, state


def test_microsoft_uses_verified_object_id(oidc):
    config, _ = oidc
    result = identity.verify_code(config, "code", "verifier", "expected-nonce")
    assert result == {"issuer": config["issuer"], "subject": "stable-object-id", "name": "Sonu"}


@pytest.mark.parametrize("claim,value", [
    ("nonce", "replayed-nonce"), ("aud", "another-app"), ("iss", "https://attacker.example"),
    ("tid", "other-tenant"), ("oid", None), ("exp", 1), ("azp", "another-app"),
])
def test_rejects_invalid_token_claims(oidc, claim, value):
    config, state = oidc
    state["claims"][claim] = value
    with pytest.raises((ValueError, jwt.JWTError)):
        identity.verify_code(config, "code", "verifier", "expected-nonce")


def test_rejects_forged_signature(oidc):
    config, state = oidc
    state["key"] = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(jwt.JWTError):
        identity.verify_code(config, "code", "verifier", "expected-nonce")


def test_browser_flow_forces_login_and_pkce(oidc):
    config, _ = oidc
    query = parse_qs(urlparse(identity.authorize_url(config, "state", "verifier", "nonce")).query)
    assert query["prompt"] == ["login"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["response_mode"] == ["form_post"]
    assert "code_verifier" not in query and "client_secret" not in query
    assert query["nonce"] == ["nonce"] and query["state"] == ["state"]
