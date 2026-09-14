package in.craves.notification.email;

import in.craves.notification.documents.DocumentBrand;
import java.io.IOException;

public final class VerificationEmailTemplate {
    public static final String SUBJECT = "Verify your email for Craves";
    public static final String LOGO_CID = "craves-verification-logo";
    public static final String PREHEADER = "Use this code to verify your Craves email address.";
    private static final String WARNING = "For your security, never share this code with anyone. Craves will never ask you to send your verification code through chat, phone or social media.";
    private VerificationEmailTemplate() {}
    public record Content(String html, String plainText, byte[] logo) {
        @Override public String toString() { return "EmailContent[REDACTED]"; }
    }
    public static Content render(String code) throws IOException {
        if (code == null || !code.matches("[0-9]{6}")) throw new IllegalArgumentException("Invalid verification code");
        byte[] logo = DocumentBrand.logo();
        String text = "Welcome to Craves.\n\nUse the verification code below to confirm your email address.\n\n" + code +
            "\n\nThis code expires in 10 minutes.\n\n" + WARNING +
            "\n\nIf you did not request this verification, you can safely ignore this email.\n\nCraves | craves.in";
        String html = """
            <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verify your email for Craves</title></head>
            <body style="margin:0;padding:0;background:#ffffff;color:#242424;font-family:Arial,Helvetica,sans-serif;">
            <div style="display:none;max-height:0;overflow:hidden;opacity:0;">%s</div>
            <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#ffffff;"><tr><td align="center" style="padding:32px 16px;">
            <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #eadfdf;border-radius:16px;"><tr><td style="padding:32px 24px;">
            <img src="cid:%s" width="140" alt="Craves" style="display:block;width:140px;max-width:100%%;height:auto;margin:0 0 28px;">
            <h1 style="font-size:26px;line-height:34px;margin:0 0 20px;font-weight:700;">Welcome to Craves.</h1>
            <p style="font-size:16px;line-height:25px;margin:0 0 24px;">Use the verification code below to confirm your email address.</p>
            <div style="border:1px solid #eed3d3;border-radius:12px;background:#fff5f5;color:#a31225;font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;padding:22px 8px;">%s</div>
            <p style="font-size:14px;line-height:22px;margin:18px 0 26px;">This code expires in 10 minutes.</p>
            <p style="font-size:14px;line-height:22px;margin:0 0 16px;">%s</p>
            <p style="font-size:14px;line-height:22px;color:#545454;margin:0 0 28px;">If you did not request this verification, you can safely ignore this email.</p>
            <p style="border-top:1px solid #eadfdf;padding-top:20px;font-size:13px;line-height:20px;margin:0;">Craves · <a href="https://craves.in" style="color:#a31225;text-decoration:underline;">craves.in</a></p>
            </td></tr></table></td></tr></table></body></html>
            """.formatted(PREHEADER, LOGO_CID, code, WARNING);
        return new Content(html, text, logo);
    }
}
