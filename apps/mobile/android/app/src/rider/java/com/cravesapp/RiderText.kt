package com.cravesapp

import android.content.Context
import android.content.res.Configuration
import java.math.BigDecimal
import java.util.Locale

/**
 * Native words (notifications, the online service's messages) in the language the rider sees in the app (WORKPLAN P2-08).
 * JS passes that language with setLanguage, and only one the build offers riders, so a translation no native speaker has
 * signed off never shows here either. English until JS says otherwise.
 */
object RiderText {
  private const val PREFS = "craves_rider_text"
  private const val LANGUAGE = "language"
  private val LANGUAGES = setOf("en", "te", "hi", "kn")

  fun setLanguage(context: Context, language: String) {
    if (language in LANGUAGES) prefs(context).edit().putString(LANGUAGE, language).apply()
  }

  fun language(context: Context): String = prefs(context).getString(LANGUAGE, null) ?: "en"

  /** A string resource in the rider's language, whatever language the phone itself is set to. */
  fun get(context: Context, id: Int, vararg args: Any): String {
    val config = Configuration(context.resources.configuration).apply { setLocale(Locale.forLanguageTag(language(context))) }
    return context.createConfigurationContext(config).getString(id, *args)
  }

  /** The server writes English: its words show only while the rider reads English; otherwise null, for the phone's own. */
  fun fromServer(context: Context, text: String?): String? = text?.takeIf { it.isNotEmpty() && language(context) == "en" }

  /** "₹62", "₹62.50": as the server's FleetRiderService.rupees. */
  fun rupees(paise: Long): String = if (paise % 100 == 0L) "₹${paise / 100}" else "₹" + BigDecimal.valueOf(paise, 2).toPlainString()

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
