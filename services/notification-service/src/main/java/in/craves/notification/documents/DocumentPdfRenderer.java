package in.craves.notification.documents;

import static in.craves.notification.documents.DocumentModels.*;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.stereotype.Component;

/** Local assets only. Never interprets HTML, scripts or remote image URLs. */
@Component
public class DocumentPdfRenderer {
    private final DocumentSettings settings;
    public DocumentPdfRenderer(DocumentSettings settings) { this.settings=settings; }
    public byte[] render(Snapshot snapshot,UUID id,String timezone) throws IOException {
        try(PDDocument pdf=new PDDocument()) {
            pdf.getDocumentInformation().setTitle(snapshot.type().title()+" - Craves");
            pdf.getDocumentInformation().setAuthor("Craves");
            pdf.getDocumentInformation().setSubject("Private account document; "+TEMPLATE_VERSION);
            PDFont regular=new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            PDFont bold=new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
            if(!settings.fontPath.isBlank()) {
                Path font=Path.of(settings.fontPath);
                if(!Files.isRegularFile(font)||Files.size(font)>12*1024*1024) throw new IllegalArgumentException("INVALID_DOCUMENT_FONT");
                try(var input=Files.newInputStream(font)) { regular=PDType0Font.load(pdf,input,true); }
                bold=regular;
            }
            PDImageXObject logo=PDImageXObject.createFromByteArray(pdf,DocumentBrand.logo(),"approved-craves-logo");
            try(Layout layout=new Layout(pdf,regular,bold,logo,snapshot,id,timezone)) { layout.render(); }
            ByteArrayOutputStream output=new ByteArrayOutputStream();
            pdf.save(output);
            if(output.size()>MAX_PDF_BYTES) throw new IllegalArgumentException("PDF_SIZE_LIMIT");
            return output.toByteArray();
        }
    }
    static final class Layout implements AutoCloseable {
        static final float LEFT=44, WIDTH=507, BOTTOM=65, LINE=12;
        static final Color INK=new Color(33,42,54), MUTED=new Color(91,102,115), ACCENT=new Color(211,61,46), LIGHT=new Color(244,246,248);
        final PDDocument pdf; final PDFont font,bold; final PDImageXObject logo;
        final Snapshot snapshot; final UUID id; final String zone;
        final long deadline=System.nanoTime()+java.time.Duration.ofSeconds(25).toNanos();
        PDPageContentStream stream; float y; int page;
        Layout(PDDocument pdf,PDFont font,PDFont bold,PDImageXObject logo,Snapshot snapshot,UUID id,String zone) {
            this.pdf=pdf; this.font=font; this.bold=bold; this.logo=logo; this.snapshot=snapshot; this.id=id; this.zone=zone;
        }
        void render() throws IOException {
            nextPage();
            paragraph(snapshot.type().title(),bold,23,INK,WIDTH); y-=6;
            paragraph("Reference: "+snapshot.reference(),font,9,MUTED,WIDTH);
            String at=DateTimeFormatter.ofPattern("dd MMM uuuu, HH:mm z",java.util.Locale.ENGLISH).withZone(ZoneId.of(zone)).format(snapshot.asOf());
            paragraph("Snapshot: "+at+"  |  Currency: "+snapshot.currency(),font,9,MUTED,WIDTH); y-=12;
            for(Field field:snapshot.facts()) {
                ensure(30);
                paragraph(field.label().toUpperCase(java.util.Locale.ROOT),bold,7.5f,MUTED,WIDTH);
                paragraph(field.value(),font,10,INK,WIDTH); y-=6;
            }
            for(Table table:snapshot.tables()) table(table);
            y-=10;
            paragraph("ABOUT THIS DOCUMENT",bold,8,ACCENT,WIDTH);
            paragraph(snapshot.notice(),font,8.5f,MUTED,WIDTH);
            closePage();
            for(int i=0;i<pdf.getNumberOfPages();i++) {
                try(PDPageContentStream footer=new PDPageContentStream(pdf,pdf.getPage(i),PDPageContentStream.AppendMode.APPEND,true,true)) {
                    footer.setNonStrokingColor(MUTED); footer.beginText(); footer.setFont(font,7);
                    footer.newLineAtOffset(LEFT,34); footer.showText("Craves  |  Private account document  |  "+id);
                    footer.endText(); footer.beginText(); footer.setFont(font,7); footer.newLineAtOffset(493,34);
                    footer.showText((i+1)+" / "+pdf.getNumberOfPages()); footer.endText();
                }
            }
        }
        void nextPage() throws IOException {
            checkBudget(); closePage();
            if(++page>100) throw new IllegalArgumentException("PDF_PAGE_LIMIT");
            PDPage paper=new PDPage(PDRectangle.A4); pdf.addPage(paper); stream=new PDPageContentStream(pdf,paper);
            stream.setNonStrokingColor(ACCENT); stream.addRect(0,827,596,15); stream.fill();
            stream.drawImage(logo,LEFT,755,46,46);
            text("CRAVES",101,778,bold,16,ACCENT);
            text("Food from home",101,763,font,9,MUTED);
            y=724;
        }
        void table(Table table) throws IOException {
            ensure(62); paragraph(table.title(),bold,13,INK,WIDTH); y-=5;
            float width=WIDTH/table.columns().size();
            header(table.columns(),width);
            if(table.rows().isEmpty()) { paragraph("No matching records in this period.",font,9,MUTED,WIDTH); y-=12; return; }
            int number=0;
            for(List<String> row:table.rows()) {
                checkBudget();
                List<List<String>> lines=new ArrayList<>(); int longest=0;
                for(String value:row) { var wrapped=wrap(value,font,8.5f,width-12); lines.add(wrapped); longest=Math.max(longest,wrapped.size()); }
                int offset=0;
                while(offset<longest) {
                    int fits=(int)((y-BOTTOM-12)/LINE);
                    if(fits<1) { nextPage(); paragraph(table.title()+" (continued)",bold,12,INK,WIDTH); y-=5; header(table.columns(),width); fits=(int)((y-BOTTOM-12)/LINE); }
                    int count=Math.min(fits,longest-offset); float height=count*LINE+12;
                    if(number%2==0) { stream.setNonStrokingColor(LIGHT); stream.addRect(LEFT,y-height,WIDTH,height); stream.fill(); }
                    for(int col=0;col<lines.size();col++) {
                        for(int line=0;line<count && offset+line<lines.get(col).size();line++)
                            text(lines.get(col).get(offset+line),LEFT+col*width+6,y-14-line*LINE,font,8.5f,INK);
                    }
                    y-=height; offset+=count;
                }
                number++;
            }
            y-=18;
        }
        void header(List<String> columns,float width) throws IOException {
            List<List<String>> wrapped=new ArrayList<>(); int lines=1;
            for(String value:columns) { var values=wrap(value,bold,8,width-12); wrapped.add(values); lines=Math.max(lines,values.size()); }
            float height=lines*LINE+12;
            ensure(height+24); stream.setNonStrokingColor(INK); stream.addRect(LEFT,y-height,WIDTH,height); stream.fill();
            for(int col=0;col<wrapped.size();col++) for(int line=0;line<wrapped.get(col).size();line++)
                text(wrapped.get(col).get(line),LEFT+col*width+6,y-14-line*LINE,bold,8,Color.WHITE);
            y-=height;
        }
        void paragraph(String value,PDFont face,float size,Color color,float width) throws IOException {
            for(String line:wrap(value,face,size,width)) { ensure(size+7); text(line,LEFT,y-size,face,size,color); y-=size+5; }
        }
        void text(String value,float x,float baseline,PDFont face,float size,Color color) throws IOException {
            stream.setNonStrokingColor(color); stream.beginText(); stream.setFont(face,size); stream.newLineAtOffset(x,baseline);
            try { stream.showText(value); } catch(IllegalArgumentException ex) { throw new IllegalArgumentException("UNSUPPORTED_DOCUMENT_GLYPH",ex); }
            finally { stream.endText(); }
        }
        static List<String> wrap(String value,PDFont face,float size,float width) throws IOException {
            List<String> result=new ArrayList<>();
            for(String part:value.replace('\r',' ').split("\n",-1)) {
                String remaining=part;
                if(remaining.isEmpty()) { result.add(""); continue; }
                while(!remaining.isEmpty()) {
                    int end=0, space=-1;
                    while(end<remaining.length()) {
                        int next=end+Character.charCount(remaining.codePointAt(end));
                        float length;
                        try { length=face.getStringWidth(remaining.substring(0,next))*size/1000; }
                        catch(IllegalArgumentException ex) { throw new IllegalArgumentException("UNSUPPORTED_DOCUMENT_GLYPH",ex); }
                        if(length>width) break;
                        if(Character.isWhitespace(remaining.codePointAt(end))) space=end;
                        end=next;
                    }
                    if(end==0) throw new IllegalArgumentException("DOCUMENT_COLUMN_TOO_NARROW");
                    if(end<remaining.length() && space>0) { result.add(remaining.substring(0,space)); remaining=remaining.substring(space+1); }
                    else { result.add(remaining.substring(0,end)); remaining=remaining.substring(end); }
                }
            }
            return result;
        }
        void ensure(float height) throws IOException { if(y-height<BOTTOM) nextPage(); }
        void checkBudget() { if(Thread.currentThread().isInterrupted()||System.nanoTime()>deadline) throw new IllegalArgumentException("PDF_RENDER_BUDGET"); }
        void closePage() throws IOException { if(stream!=null) { stream.close(); stream=null; } }
        @Override public void close() throws IOException { closePage(); }
    }
}
