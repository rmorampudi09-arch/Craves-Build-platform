FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B clean package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/target/auth-service-*.jar /app/auth-service.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/auth-service.jar"]
