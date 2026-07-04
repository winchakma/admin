import paramiko

host = '194.242.57.190'
username = 'root'
password = '9JA3vVanRIs9b7KE2FlfY8'

try:
    transport = paramiko.Transport((host, 22))
    transport.connect(username=username, password=password)
    client = paramiko.SSHClient()
    client._transport = transport
    stdin, stdout, stderr = client.exec_command("pm2 logs --nostream --lines 50")
    print("STDOUT:", stdout.read().decode(errors='ignore'))
    print("STDERR:", stderr.read().decode(errors='ignore'))
    client.close()
except Exception as e:
    print(f"Error: {e}")
