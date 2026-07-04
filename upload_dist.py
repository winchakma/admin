import paramiko
import os
import stat

host = '194.242.57.190'
username = 'root'
password = '9JA3vVanRIs9b7KE2FlfY8'
local_dir = 'c:\\Users\\user\\Desktop\\admin\\frontend\\dist'
remote_dir = '/var/www/admin/frontend/dist'

transport = paramiko.Transport((host, 22))
transport.connect(username=username, password=password)
sftp = paramiko.SFTPClient.from_transport(transport)

def put_dir(local_path, remote_path):
    for root, dirs, files in os.walk(local_path):
        remote_root = root.replace(local_path, remote_path).replace('\\', '/')
        try:
            sftp.stat(remote_root)
        except IOError:
            sftp.mkdir(remote_root)
        for file in files:
            local_file = os.path.join(root, file)
            remote_file = remote_root + '/' + file
            print(f'Uploading {local_file} to {remote_file}')
            sftp.put(local_file, remote_file)

put_dir(local_dir, remote_dir)
sftp.close()
transport.close()
