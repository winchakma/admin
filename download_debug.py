import paramiko

host = '194.242.57.190'
username = 'root'
password = '9JA3vVanRIs9b7KE2FlfY8'
remote_file = '/var/www/admin/backend/uploads/ffmpeg-debug.txt'
local_file = 'c:\\Users\\user\\Desktop\\admin\\ffmpeg-debug.txt'

try:
    transport = paramiko.Transport((host, 22))
    transport.connect(username=username, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    sftp.get(remote_file, local_file)
    print("Downloaded ffmpeg-debug log.")
    sftp.close()
    transport.close()
except Exception as e:
    print(f"Error: {e}")
