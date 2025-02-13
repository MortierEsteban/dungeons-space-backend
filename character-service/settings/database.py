from pathlib import Path
import environ

# Initialize environment variables
env = environ.Env(
    # Set default values and casting types
    DEBUG=(bool, False)
)

# Reading the .env file
environ.Env.read_env()

print(env())
# Base directory of the project
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: Keep the secret key used in production secret!
SECRET_KEY = env("SECRET_KEY")

# SECURITY WARNING: Don't run with debug turned on in production!
DEBUG = env("DEBUG")
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': env("POSTGRES_DB"),
        'USER': env("POSTGRES_USER"),
        'PASSWORD': env("POSTGRES_PASSWORD"),
        'HOST': env("POSTGRES_HOST", default="localhost"),
        'PORT': env("POSTGRES_PORT", default="5432"),
    }
}

# Allowed hosts
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost",])
