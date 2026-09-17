FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml ./
RUN mvn -B -ntp dependency:go-offline
COPY src ./src
RUN mvn -B -ntp package -DskipTests
FROM eclipse-temurin:21-jre-jammy
RUN groupadd --gid 10001 craves && useradd --uid 10001 --gid 10001 --no-create-home craves
WORKDIR /app
COPY --from=build --chown=10001:10001 /workspace/target/referral-service-0.1.0-SNAPSHOT.jar /app/app.jar
USER 10001:10001
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError"
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
