import json
import os

path = r'C:\Users\user\.gemini\antigravity-ide\brain\61439fbd-8a84-4582-b61f-f2b112f9c704\.system_generated\logs\transcript_full.jsonl'
with open(path, 'r', encoding='utf-8') as f:
    for line in f:
        data = json.loads(line)
        if 'tool_calls' in data:
            for tc in data['tool_calls']:
                name = tc['name']
                args = tc['args']
                if name == 'run_command' and 'checkout' in args.get('CommandLine', ''):
                    print(f"Step {data['step_index']}: {args['CommandLine']}")
