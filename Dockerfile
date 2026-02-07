FROM node:18-slim

# Install system dependencies required for 'canvas'
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the bot code
COPY . .

# Expose the port (matches the port in your bot.js)
ENV PORT=3000
EXPOSE 3000

# Start the bot
CMD ["npm", "start"]