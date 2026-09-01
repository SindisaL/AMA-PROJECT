# Asset Management App - Windows 11

## 1. Backend

1. Open **Command Prompt**.
2. Go to the project folder:
   ```cmd
   cd asset-mgmt-app
   ```
3. (Optional) create venv:
   ```cmd
   python -m venv venv
   venv\Scripts\activate
   ```
4. Install Python requirements:
   ```cmd
   pip install -r requirements.txt
   ```
5. Run backend:
   ```cmd
   run-backend.bat
   ```
   Backend will run at http://127.0.0.1:8000

## 2. Frontend

1. Open **another** Command Prompt.
2. Go to the project folder:
   ```cmd
   cd asset-mgmt-app
   ```
3. Run:
   ```cmd
   run-frontend.bat
   ```
4. Open http://localhost:5173 in your browser.

## Notes

- Make sure Python and Node.js are installed.
- The frontend talks to http://127.0.0.1:8000 so keep the backend running.
