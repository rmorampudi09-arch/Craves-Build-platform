FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --chown=10001:10001 target/integration-service-0.1.0-SNAPSHOT.jar app.jar
USER 10001:10001

EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
