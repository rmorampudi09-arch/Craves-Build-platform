package in.craves.adminexplorer;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="EXPLORER_TEST_DB_URL",matches="jdbc:postgresql://127[.]0[.]0[.]1:[0-9]+/craves_explorer_test")
class ExplorerPostgresTest {
 JdbcTemplate jdbc;ExplorerEngine engine;UUID actor=UUID.randomUUID();
 @BeforeEach void setup() throws Exception {
  String url=System.getenv("EXPLORER_TEST_DB_URL");
  if(!url.matches("jdbc:postgresql://127[.]0[.]0[.]1:[0-9]+/craves_explorer_test"))throw new IllegalStateException("Only the disposable loopback test database is allowed");
  var ds=new DriverManagerDataSource(url,"postgres","postgres");jdbc=new JdbcTemplate(ds);
  jdbc.execute("CREATE SCHEMA IF NOT EXISTS order_schema; DROP TABLE IF EXISTS auth_identity_role, auth_identity, chef_application, order_schema.customer_order CASCADE; DROP TABLE IF EXISTS "+ExplorerDomain.AUDIT+" CASCADE; DROP FUNCTION IF EXISTS "+ExplorerFixture.FUNCTION+" CASCADE");
  jdbc.execute(ExplorerFixture.DDL);
  try(var stream=getClass().getResourceAsStream(ExplorerFixture.MIGRATION)){assertNotNull(stream);jdbc.execute(new String(stream.readAllBytes(),StandardCharsets.UTF_8));}
  jdbc.execute("DROP TABLE IF EXISTS "+ExplorerRateLimiter.TABLE);
  try(var stream=getClass().getResourceAsStream(ExplorerFixture.ADMISSION_MIGRATION)){assertNotNull(stream);jdbc.execute(new String(stream.readAllBytes(),StandardCharsets.UTF_8));}
  engine=new ExplorerEngine(ds);
 }
 ExplorerQuery q(String status,String cursor,String search,String facet,String sort){return ExplorerQuery.parse(ExplorerQueryTest.request("","",status,search,facet,25,sort,"records",ExplorerQueryTest.NOW.toString(),cursor,"Review fixture records for quality"),ExplorerDomain.DATASET,ExplorerQueryTest.NOW);}
 @Test void completePopulationAndTrendAreNotPageSized(){var r=engine.read(actor,q("",null,"","","newest"));assertEquals(65,r.total());assertEquals(25,r.rows().size());assertEquals(65,r.trend().stream().mapToLong(ExplorerEngine.Bucket::count).sum());assertNotNull(r.nextCursor());assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM "+ExplorerDomain.AUDIT+"",Integer.class));}
 @Test void tiedTimestampsAndAllPagesHaveNoDuplicates(){Set<UUID> seen=new HashSet<>();String cursor=null;int pages=0;do{var r=engine.read(actor,q("",cursor,"","","newest"));for(var row:r.rows())assertTrue(seen.add(row.id()));cursor=r.nextCursor();pages++;}while(cursor!=null);assertEquals(65,seen.size());assertEquals(3,pages);}
 @Test void oldestAndNewestAreTrueOpposites(){var oldest=engine.read(actor,q("",null,"","","oldest"));var newest=engine.read(actor,q("",null,"","","newest"));assertTrue(oldest.rows().getFirst().createdAt().isBefore(newest.rows().getFirst().createdAt()));assertEquals("00000000-0000-4000-8000-000000000001",oldest.rows().getFirst().id().toString());}
 @Test void statusFacetRetainsPopulationButRowsAndTrendMatchSelection(){var r=engine.read(actor,q(ExplorerFixture.STATUS,null,"","","newest"));assertEquals(32,r.total());assertEquals(65,r.populationTotal());assertTrue(r.rows().stream().allMatch(row->row.status().equals(ExplorerFixture.STATUS)));assertEquals(32,r.trend().stream().mapToLong(ExplorerEngine.Bucket::count).sum());}
 @Test void chartClickBoundariesSelectExactlyTheBucket(){var all=engine.read(actor,q("",null,"","","newest"));for(var b:all.trend()){var query=ExplorerQuery.parse(ExplorerQueryTest.request(b.fromDate(),b.toDate(),"","","",25,"newest","records",all.boundary().toString(),null,"Inspect selected chart period"),ExplorerDomain.DATASET,ExplorerQueryTest.NOW);assertEquals(b.count(),engine.read(actor,query).total());}}
 @Test void wildcardSearchDoesNotReturnEverything(){assertEquals(0,engine.read(actor,q("",null,"%","","newest")).total());}
 @Test void domainFacetMatchesItsRealPopulation(){assertEquals(ExplorerFixture.FACET_COUNT,engine.read(actor,q("",null,"",ExplorerFixture.FACET,"newest")).total());}
 @Test void contactFieldsAreMaskedOrAbsent(){var row=engine.read(actor,q("",null,"","","newest")).rows().getFirst();if(row.phone()!=null)assertTrue(row.phone().startsWith("•••• "));if(row.email()!=null)assertFalse(row.email().contains("example.test"));if(row.amount()!=null)assertEquals("69.01",row.amount());}
 @Test void auditIsRequiredAndAppendOnly(){engine.read(actor,q("",null,"","","newest"));assertThrows(RuntimeException.class,()->jdbc.execute("DELETE FROM "+ExplorerDomain.AUDIT+""));assertThrows(RuntimeException.class,()->jdbc.execute("TRUNCATE "+ExplorerDomain.AUDIT+""));jdbc.execute("DROP TABLE "+ExplorerDomain.AUDIT+" CASCADE");assertThrows(RuntimeException.class,()->engine.read(actor,q("",null,"","","newest")));assertEquals(65,jdbc.queryForObject("SELECT count(*) FROM "+ExplorerFixture.TABLE,Integer.class));}
}
