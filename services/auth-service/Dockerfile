FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B clean package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --chown=10001:10001 --from=build /workspace/target/auth-service-*.jar /app/auth-service.jar
USER 10001:10001

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/auth-service.jar"]
