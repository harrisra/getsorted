# getsorted


## Developing on Windows

### Setup

1. Enable WSL2 (if not already): open an elevated PowerShell and run wsl --install. This enables the required Windows features and installs a Linux kernel; it usually asks for a reboot.
2. Install Docker Desktop: download from docker.com, or via winget: winget install Docker.DockerDesktop.
3. After install, launch Docker Desktop once, let it finish its setup (it'll confirm WSL2 integration), and it needs to be running whenever you use docker/docker compose.
4. Verify with docker --version and docker compose version in a new terminal.

### Launch

To get it running:
docker compose up --build
docker compose exec backend python manage.py migrate
Then visit http://localhost:5173 (frontend, will show "connected" once backend is up) and http://localhost:8000/admin/.

