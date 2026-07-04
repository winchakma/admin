import json
import os

path = r'C:\Users\user\.gemini\antigravity-ide\brain\8ac0abf5-455c-4e61-938e-d16a8db6f26b\.system_generated\logs\transcript_full.jsonl'
with open(path, 'r', encoding='utf-8') as f:
    for line in f:
        data = json.loads(line)
        if 'tool_calls' in data:
            for tc in data['tool_calls']:
                name = tc['name']
                args = tc['args']
                if name in ['write_to_file', 'replace_file_content', 'multi_replace_file_content', 'run_command']:
                    target = args.get('TargetFile', '') or args.get('AbsolutePath', '')
                    if 'ViewerPage.jsx' in target or 'api.js' in target or 'ffmpegEngine.js' in target or 'scheduler.js' in target or 'upload' in target:
                        print(f"Step {data['step_index']}: {name} on {target}")
