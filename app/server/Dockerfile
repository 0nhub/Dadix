# Use the lts nodejs on alpine image
FROM node:lts-alpine

# Create none-root user and group
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set NODE_ENV env variable to production 
ENV NODE_ENV production

# Install pm2 globally
RUN npm install -g pm2

# Set the working directory
WORKDIR /app

# Copy app files to /app
COPY --chown=appuser:appgroup . /app

# Install dependencies
RUN npm install --only=production

# Switch to none-root user
USER appuser

# Start the application with PM2
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
