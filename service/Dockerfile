# image בסיס: Node 20 על Alpine Linux (קטן מאוד)
FROM node:20-alpine

# כל הפקודות הבאות ירוצו בתיקייה /app בתוך הקונטיינר
WORKDIR /app

# קודם רק package.json — כדי שההתקנה תישמר ב-cache
COPY package*.json ./
RUN npm ci --omit=dev

# עכשיו שאר הקוד
COPY . .

# תיעוד: השירות מאזין על 4000
EXPOSE 4000

CMD ["node", "server.js"]