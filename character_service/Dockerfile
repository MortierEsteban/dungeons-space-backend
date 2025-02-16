# Use the official Python image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /app

# Copy only requirements first to leverage Docker caching
COPY requirements.txt /app/

# Install dependencies before copying the full app
RUN pip install --no-cache-dir -r requirements.txt

# Now copy the full app (after dependencies are installed)
COPY . /app

# Expose the Django development server port
EXPOSE 8000

# Run the Django server
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
#CMD ["sleep", "100000"]