import paramiko

host = '194.242.57.190'
username = 'root'
password = '9JA3vVanRIs9b7KE2FlfY8'

cmd = "cd /var/www/admin/backend && ffmpeg -stream_loop -1 -re -i '/var/www/admin/backend/uploads/1783124125530-Welcome to the Jungle (2026) Hindi 1080p HDTS x264 ESub [DDN].mkv' -stream_loop -1 -re -f image2 -i '/var/www/admin/backend/stream_data/logo_live.png' -stream_loop -1 -re -f image2 -i '/var/www/admin/backend/stream_data/ots_live.png' -y -filter_complex \"[0:v][1:v]overlay=W-w-20:20[v1];[v1][2:v]overlay=20:H-h-60[v2];[v2]drawtext=fontfile='./font.ttf':textfile='./stream_data/ticker1.txt':reload=1:fontcolor=white:fontsize=24:x=w-((t*50)-(w+tw)*trunc((t*50)/(w+tw))):y=h-40[out]\" -map '[out]' -map 0:a -c:v libx264 -preset ultrafast -c:a aac -ar 44100 -f hls -hls_time 4 -hls_list_size 5 -hls_flags delete_segments /var/www/admin/backend/stream/live.m3u8 > /tmp/ffmpeg_test.log 2>&1 & sleep 3 && cat /tmp/ffmpeg_test.log"

try:
    transport = paramiko.Transport((host, 22))
    transport.connect(username=username, password=password)
    client = paramiko.SSHClient()
    client._transport = transport
    stdin, stdout, stderr = client.exec_command(cmd)
    print("STDOUT:", stdout.read().decode(errors='ignore'))
    print("STDERR:", stderr.read().decode(errors='ignore'))
    client.close()
except Exception as e:
    print(f"Error: {e}")
