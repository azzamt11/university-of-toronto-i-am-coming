FROM nginx:1.27-alpine

COPY index.html styles.css script.js roadmap.json /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
