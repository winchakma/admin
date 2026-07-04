import paramiko

host = '194.242.57.190'
username = 'root'
password = '9JA3vVanRIs9b7KE2FlfY8'
remote_file = '/root/.pm2/logs/server-out.log'
local_file = 'c:\\Users\\user\\Desktop\\admin\\server-out.log'

try:
    transport = paramiko.Transport((host, 22))
    transport.connect(username=username, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    sftp.get(remote_file, local_file)
    print("Downloaded server-out log.")
    
    sftp.get('/root/.pm2/logs/server-error.log', 'c:\\Users\\user\\Desktop\\admin\\server-error.log')
    print("Downloaded server-error log.")
    sftp.close()
    transport.close()
except Exception as e:
    print(f"Error: {e}")
