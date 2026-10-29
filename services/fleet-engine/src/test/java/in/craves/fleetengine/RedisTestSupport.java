package in.craves.fleetengine;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Assumptions;

/**
 * Throwaway redis-server processes for tests: one plain node, or a three-node cluster with every slot assigned, as Craves's
 * Azure Managed Redis (OSS clustering policy) is. Tests skip when redis-server is not installed (CI installs it). Every
 * process stops when the JVM exits.
 */
public final class RedisTestSupport {
    private static final List<Process> PROCESSES = new CopyOnWriteArrayList<>();

    static {
        Runtime.getRuntime().addShutdownHook(new Thread(() -> PROCESSES.forEach(Process::destroyForcibly)));
    }

    private RedisTestSupport() {
    }

    /** A plain redis-server; returns its redis:// URL. */
    public static String server() {
        return "redis://127.0.0.1:" + launch(freePort(), false).port;
    }

    /** Three cluster nodes sharing the 16,384 slots; returns the first node's redis:// URL (the client finds the others). */
    public static String cluster() {
        Node[] nodes = {launch(freePort(), true), launch(freePort(), true), launch(freePort(), true)};
        int[][] ranges = {{0, 5460}, {5461, 10922}, {10923, 16383}};
        for (int i = 0; i < 3; i++) {
            command(nodes[i].port, "CLUSTER", "ADDSLOTSRANGE", Integer.toString(ranges[i][0]), Integer.toString(ranges[i][1]));
        }
        for (int i = 1; i < 3; i++) {
            command(nodes[i].port, "CLUSTER", "MEET", "127.0.0.1", Integer.toString(nodes[0].port));
        }
        long deadline = System.currentTimeMillis() + 15_000;
        while (System.currentTimeMillis() < deadline) {
            boolean ok = true;
            for (Node n : nodes) {
                String info = reply(n.port, "CLUSTER", "INFO");
                ok &= info.contains("cluster_state:ok") && info.contains("cluster_known_nodes:3");
            }
            if (ok) {
                return "redis://127.0.0.1:" + nodes[0].port;
            }
            sleep(100);
        }
        throw new IllegalStateException("the test cluster did not come up");
    }

    /** A plain redis-server that can be killed and started again on the same port, as a patch that keeps the address. */
    public static final class Restartable {
        public final int port;
        private Node node;

        Restartable(int port) {
            this.port = port;
            this.node = launch(port, false);
        }

        public String url() {
            return "redis://127.0.0.1:" + port;
        }

        public void restart() {
            node.process.destroyForcibly();
            try {
                node.process.waitFor();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            node = launch(port, false);
        }
    }

    public static Restartable restartable() {
        return new Restartable(freePort());
    }

    /** A key prefix of its own, so tests sharing a server never see each other's keys. */
    public static String prefix() {
        return "t" + UUID.randomUUID().toString().substring(0, 8) + ":";
    }

    private record Node(int port, Process process) {
    }

    private static Node launch(int port, boolean cluster) {
        String path = redisServer();
        Assumptions.assumeTrue(path != null, "redis-server is not installed");
        try {
            Path dir = Files.createTempDirectory("fleet-redis");
            dir.toFile().deleteOnExit();
            List<String> args = new ArrayList<>(List.of(path, "--port", Integer.toString(port), "--bind", "127.0.0.1", "--save", "",
                "--appendonly", "no", "--dir", dir.toString()));
            if (cluster) {
                args.addAll(List.of("--cluster-enabled", "yes", "--cluster-config-file", dir.resolve("nodes.conf").toString(),
                    "--cluster-node-timeout", "2000"));
            }
            Process p = new ProcessBuilder(args).redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
            PROCESSES.add(p);
            long deadline = System.currentTimeMillis() + 5_000;
            while (System.currentTimeMillis() < deadline) {
                if ("PONG".equals(reply(port, "PING"))) {
                    return new Node(port, p);
                }
                sleep(20);
            }
            throw new IllegalStateException("redis-server on " + port + " did not start");
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String redisServer() {
        for (String dir : System.getenv().getOrDefault("PATH", "").split(File.pathSeparator)) {
            File f = new File(dir, "redis-server");
            if (f.canExecute()) {
                return f.getPath();
            }
        }
        return null;
    }

    private static int freePort() {
        try (ServerSocket s = new ServerSocket(0)) {
            return s.getLocalPort();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Sends one command to one node and fails on an error reply. */
    public static void command(int port, String... args) {
        String r = reply(port, args);
        if (r.startsWith("-")) {
            throw new IllegalStateException(r);
        }
    }

    /** Sends one command to one node; returns the first reply line, or a bulk string's body ("" when not answered). */
    public static String reply(int port, String... args) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress("127.0.0.1", port), 1_000);
            s.setSoTimeout(2_000);
            StringBuilder b = new StringBuilder("*").append(args.length).append("\r\n");
            for (String a : args) {
                b.append('$').append(a.getBytes(StandardCharsets.UTF_8).length).append("\r\n").append(a).append("\r\n");
            }
            OutputStream out = s.getOutputStream();
            out.write(b.toString().getBytes(StandardCharsets.UTF_8));
            out.flush();
            BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
            String line = in.readLine();
            if (line == null) {
                return "";
            }
            if (line.startsWith("$")) {
                int n = Integer.parseInt(line.substring(1).strip());
                if (n < 0) {
                    return "";
                }
                char[] body = new char[n];
                int read = 0;
                while (read < n) {
                    int k = in.read(body, read, n - read);
                    if (k < 0) {
                        break;
                    }
                    read += k;
                }
                return new String(body, 0, read);
            }
            return line.startsWith("+") ? line.substring(1).strip() : line.strip(); // a simple string's text
        } catch (IOException e) {
            return "";
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
