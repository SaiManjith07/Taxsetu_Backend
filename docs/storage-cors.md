# Fix Firebase Storage CORS (for localhost uploads)

If "Confirm & save" on Photo Upload fails with **CORS** when uploading the image, the app still **saves the invoice data** to Firestore; only the image URL is missing.

To allow image uploads from `http://localhost:5173` (or your dev origin):

1. Create a file `cors.json` in this project root (or any folder):

```json
[
  {
    "origin": ["http://localhost:5173", "http://127.0.0.1:5173"],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Content-Length", "x-goog-resumable"]
  }
]
```

2. Apply it to your Firebase Storage bucket using Google Cloud `gsutil`:

```bash
gsutil cors set cors.json gs://podnotes-eed71.firebasestorage.app
```

(Replace the bucket name with yours from Firebase Console → Storage.)

3. If you don’t have `gsutil`, install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) and run `gcloud auth login` first.

After this, image uploads from localhost should work and the invoice document will also get `metadata.image_url`.
