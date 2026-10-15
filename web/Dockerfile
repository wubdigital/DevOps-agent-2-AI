FROM node:20-alpine

WORKDIR /app

# התקנת חבילות (כולל devDependencies — צריך אותן ל-build)
COPY package*.json ./
RUN npm ci

# העתקת הקוד ובניית גרסת production
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]