# Use the lts nodejs on alpine image
FROM node:lts-alpine

# Create none-root user and group
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set NODE_ENV env variable to production 
ENV NODE_ENV production

# Set the working directory
WORKDIR /app

# Copy app files to /app
COPY --chown=appuser:appgroup . /app

# Install dependencies
RUN npm install --only=production

# Build the app
RUN npm run build

# Switch to none-root user
USER appuser

CMD ["npm", "run", "start"]
