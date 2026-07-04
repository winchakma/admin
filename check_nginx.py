import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('194.242.57.190', 22, 'root', '9JA3vVanRIs9b7KE2FlfY8')
stdin, stdout, stderr = client.exec_command('grep "POST /api/" /var/log/nginx/access.log | tail -n 10')
print(stdout.read().decode())
