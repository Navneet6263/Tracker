import boto3
import os
from uuid import uuid4

ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
BUCKET = os.getenv("AWS_BUCKET_NAME", "tracker-screenshots")

if ACCESS_KEY and ACCESS_KEY != "dummy":
    s3 = boto3.client(
        "s3",
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )
else:
    s3 = None
    os.makedirs("uploads", exist_ok=True)

def upload_to_s3(file_bytes: bytes, employee_id: int) -> str:
    key = f"screenshots/{employee_id}/{uuid4().hex}.png"
    if s3:
        s3.put_object(Bucket=BUCKET, Key=key, Body=file_bytes, ContentType="application/octet-stream")
        return f"https://{BUCKET}.s3.amazonaws.com/{key}"
    else:
        # Fallback to local storage for testing
        filename = key.replace("/", "_")
        local_path = os.path.join("uploads", filename)
        with open(local_path, "wb") as f:
            f.write(file_bytes)
        return f"http://localhost:8000/uploads/{filename}"

def get_presigned_url(s3_url: str, expires: int = 3600) -> str:
    if s3:
        key = s3_url.split(".amazonaws.com/")[-1]
        return s3.generate_presigned_url(
            "get_object", Params={"Bucket": BUCKET, "Key": key}, ExpiresIn=expires
        )
    return s3_url

