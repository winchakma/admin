import requests
import json
import jwt

token = jwt.encode({'id': 'test'}, 'supersecret123', algorithm='HS256')
url = "http://localhost:5000/api/overlays/upload-logo"
headers = {'Authorization': f'Bearer {token}'}
files = {'image': ('test.txt', 'test content')}
res = requests.post(url, headers=headers, files=files)
print(res.status_code)
print(res.text)
