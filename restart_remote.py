import paramiko

host = '194.242.57.190'
username = 'root'
password = '9JA3vVanRIs9b7KE2FlfY8'

transport = paramiko.Transport((host, 22))
transport.connect(username=username, password=password)
client = paramiko.SSHClient()
client._transport = transport

stdin, stdout, stderr = client.exec_command("pm2 restart all")
print(stdout.read().decode())
print(stderr.read().decode())
client.close()
