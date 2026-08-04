FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --chown=10001:10001 target/notification-service-0.1.0-SNAPSHOT.jar app.jar
USER 10001:10001

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
