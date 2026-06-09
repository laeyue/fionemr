FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies (only production if needed, but installing all is fine)
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Expose port
EXPOSE 5000

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Start the application
CMD ["npm", "start"]
