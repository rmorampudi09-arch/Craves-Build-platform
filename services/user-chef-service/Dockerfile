FROM maven:3.9.9-eclipse-temurin-21 AS builder
WORKDIR /workspace
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B clean package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system craves && useradd --system --gid craves craves
COPY --from=builder /workspace/target/user-chef-service-0.1.0-SNAPSHOT.jar /app/app.jar
USER craves
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
