from pathlib import Path
import json
import sys


def main():
    base_dir = Path(__file__).resolve().parent
    data_path = base_dir / 'data.json'
    frontend_path = base_dir.parent / 'frontend' / 'index.html'

    print('Python executable:', sys.executable)

    try:
        import flask
        print('Flask version:', flask.__version__)
    except ImportError:
        print('ERROR: Flask is not installed in the current environment.')
        return 1

    if not data_path.exists():
        print(f'ERROR: Missing data file: {data_path}')
        return 1

    try:
        with data_path.open('r', encoding='utf-8') as f:
            json.load(f)
        print('data.json loaded successfully.')
    except json.JSONDecodeError as exc:
        print(f'ERROR: data.json is invalid JSON: {exc}')
        return 1

    if not frontend_path.exists():
        print(f'WARNING: Frontend index.html not found at {frontend_path}')
    else:
        print('Frontend files are present.')

    print('\nConfiguration check passed. Run the backend server with the VS Code launch configuration or the task.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
