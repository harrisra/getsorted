# getsorted


## Developing on Windows (Note I now do this in powershell)

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

## First time Django setup


The admin superuser is created interactively on first run. From the codebase:

- backend/accounts/managers.py defines a standard create_superuser (the custom User model is email-based, no username field), but nothing invokes it with preset values.
- There are no fixtures, migrations, entrypoint scripts, or DJANGO_SUPERUSER_* env vars that create an admin account.
- docs/setup.md:38 and CLAUDE.md:90 both say you create it yourself:

docker compose exec backend python manage.py createsuperuser

That command prompts you for an email and password of your choosing — those become your admin credentials at http://localhost:8000/admin/.

One thing to note that's easy to confuse with an "admin credential": the Postgres database credentials are defaulted in docker-compose.yml (db/user/password all getsorted), but that's the database, not the Django admin login.

So: whatever email/password you entered at createsuperuser time. If you've forgotten it, you can reset it with docker compose exec backend python manage.py changepassword <your-email>, or create a new superuser with the command above.