package com.aisle.grocery

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.round
import kotlin.math.sin
import kotlin.math.sqrt

data class Place(val label: String, val lat: Double, val lon: Double, val postal: String)

data class Store(
    val name: String,
    val chainKey: String,
    val lat: Double,
    val lon: Double,
    val miles: Double,
    val street: String,
)

data class Deal(
    val id: String,
    val name: String,
    val merchant: String,
    val chainKey: String,
    val price: Double,
    val image: String?,
    val store: Store?,
)

data class AisleResult(val place: Place, val deals: List<Deal>, val stores: List<Store>)

private data class Chain(val key: String, val label: String, val needles: List<String>, val ad: String?)

private val CHAINS = listOf(
    Chain("hyvee", "Hy-Vee", listOf("hy-vee", "hyvee", "hy vee"), "https://www.hy-vee.com/deals"),
    Chain("aldi", "Aldi", listOf("aldi"), "https://www.aldi.us/weekly-specials/this-weeks-aldi-finds/"),
    Chain("walmart", "Walmart", listOf("walmart", "wal-mart"), "https://www.walmart.com/shop/deals"),
    Chain("target", "Target", listOf("target"), "https://www.target.com/weekly-ad"),
    Chain("dollargeneral", "Dollar General", listOf("dollar general"), "https://www.dollargeneral.com/deals/weekly-ads"),
    Chain("familydollar", "Family Dollar", listOf("family dollar"), "https://www.familydollar.com/weekly-ads"),
    Chain("fareway", "Fareway", listOf("fareway"), "https://www.fareway.com/stores"),
    Chain("costco", "Costco", listOf("costco"), "https://www.costco.com/o/-/warehouse-savings"),
    Chain("sams", "Sam's Club", listOf("sam's club", "sams club"), "https://www.samsclub.com/savings"),
    Chain("kwikstar", "Kwik Star", listOf("kwik star", "kwik trip"), "https://www.kwiktrip.com/savings"),
    Chain("lewis", "Lewis Drug", listOf("lewis drug", "lewis"), "https://www.lewisdrug.com/weekly-ad"),
    Chain("kroger", "Kroger", listOf("kroger"), "https://www.kroger.com/weeklyad"),
    Chain("fareway", "Fareway", listOf("fareway"), "https://www.fareway.com/stores"),
)

private val BLOCK = Regex(
    """\b(sofa|mattress|furniture|television|\btv\b|laptop|iphone|playstation|xbox|vacuum|bicycle)\b""",
    RegexOption.IGNORE_CASE,
)

fun storeAd(chainKey: String): String? = CHAINS.firstOrNull { it.key == chainKey }?.ad

fun bulkScore(name: String): Int {
    val n = name.lowercase()
    var score = 0
    if (Regex("""\b(bulk|club|family|value pack|party|mega|jumbo|warehouse)\b""").containsMatchIn(n)) score += 40
    Regex("""(\d{1,3})\s*-?\s*(?:pk|pack|ct|count)\b""").find(n)?.let {
        score += min(80, it.groupValues[1].toInt() * 4)
    }
    Regex("""(\d+(?:\.\d+)?)\s*-?\s*lbs?\b""").find(n)?.let {
        score += min(70, (it.groupValues[1].toDouble() * 8).toInt())
    }
    Regex("""(\d+(?:\.\d+)?)\s*-?\s*(?:gal|gallons)\b""").find(n)?.let {
        score += min(60, (it.groupValues[1].toDouble() * 24).toInt())
    }
    return if (score == 0) 4 else score
}

fun money(n: Double) = "$" + "%.2f".format(n)

fun formatMiles(n: Double) = if (n < 0.1) "Under 0.1 mi" else "${"%.1f".format(n)} mi"

class AisleRepository {
    private val http = OkHttpClient.Builder()
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

    fun load(postal: String): AisleResult {
        val place = zipPlace(postal) ?: error("Couldn't find ZIP $postal")
        val deals = flyers(place)
        val stores = stores(place)
        val attached = deals.map { deal ->
            val nearest = stores.filter { it.chainKey == deal.chainKey }.minByOrNull { it.miles }
            deal.copy(store = nearest)
        }.sortedWith(compareByDescending<Deal> { bulkScore(it.name) }.thenBy { it.price })
        return AisleResult(place, attached, stores.sortedBy { it.miles })
    }

    private fun zipPlace(zip: String): Place? {
        val json = get("https://api.zippopotam.us/us/$zip") ?: return null
        val places = JSONObject(json).optJSONArray("places") ?: return null
        if (places.length() == 0) return null
        val spot = places.getJSONObject(0)
        val lat = spot.optString("latitude").toDoubleOrNull() ?: return null
        val lon = spot.optString("longitude").toDoubleOrNull() ?: return null
        val city = spot.optString("place name", "Nearby")
        val region = spot.optString("state abbreviation", "")
        return Place("$city, $region $zip", lat, lon, zip)
    }

    private fun flyers(place: Place): List<Deal> {
        val index = get("https://backflipp.wishabi.com/flipp/flyers?locale=en-us&postal_code=${place.postal}")
            ?: return emptyList()
        val flyers = JSONObject(index).optJSONArray("flyers") ?: return emptyList()
        val picked = pickFlyers(flyers).take(8)
        val out = ArrayList<Deal>()
        val seen = HashSet<String>()
        for (flyer in picked) {
            val body = get("https://backflipp.wishabi.com/flipp/flyers/${flyer.id}") ?: continue
            val items = JSONObject(body).optJSONArray("items") ?: continue
            for (i in 0 until items.length()) {
                val item = items.getJSONObject(i)
                val name = item.optString("name").replace(Regex("\\s+"), " ").trim()
                val price = item.optString("price").toDoubleOrNull()
                val id = item.optLong("id")
                if (name.length < 3 || price == null || price <= 0 || id == 0L) continue
                if (BLOCK.containsMatchIn(name)) continue
                val key = "${flyer.chainKey}|${name.lowercase()}|${"%.2f".format(price)}"
                if (!seen.add(key)) continue
                val image = item.optString("cutout_image_url").takeIf { it.startsWith("http") }
                    ?.replace("http://", "https://")
                out += Deal("$id", name.take(140), flyer.label, flyer.chainKey, round(price * 100) / 100, image, null)
                if (out.size >= 240) return out
            }
        }
        return out
    }

    private data class FlyerPick(val id: Long, val label: String, val chainKey: String)

    private fun pickFlyers(flyers: JSONArray): List<FlyerPick> {
        val best = LinkedHashMap<String, FlyerPick>()
        for (i in 0 until flyers.length()) {
            val row = flyers.getJSONObject(i)
            val merchant = row.optString("merchant")
            val chain = chainOf(merchant) ?: continue
            val id = row.optLong("id")
            if (id == 0L || best.containsKey(chain.key)) continue
            best[chain.key] = FlyerPick(id, chain.label, chain.key)
        }
        return best.values.toList()
    }

    private fun stores(place: Place): List<Store> {
        val box = viewBox(place.lat, place.lon, 8.0)
        val url = "https://nominatim.openstreetmap.org/search?" +
            "format=jsonv2&addressdetails=1&countrycodes=us&limit=25&bounded=1" +
            "&q=${enc("supermarket")}&viewbox=$box"
        val body = get(url, "AisleGrocery/1.0 (android)") ?: return emptyList()
        val rows = JSONArray(body)
        val found = ArrayList<Store>()
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            val name = row.optString("name").ifBlank { row.optString("display_name").substringBefore(",") }
            val lat = row.optString("lat").toDoubleOrNull() ?: continue
            val lon = row.optString("lon").toDoubleOrNull() ?: continue
            val chain = chainOf(name) ?: continue
            val miles = milesBetween(place.lat, place.lon, lat, lon)
            if (miles > 12) continue
            val address = row.optJSONObject("address")
            val street = listOfNotNull(
                address?.optString("house_number")?.takeIf { it.isNotBlank() },
                address?.optString("road")?.takeIf { it.isNotBlank() },
            ).joinToString(" ")
            found += Store(name, chain.key, lat, lon, miles, street)
        }
        return found
            .groupBy { "${it.chainKey}:${"%.3f".format(it.lat)}" }
            .map { it.value.minBy { store -> store.miles } }
            .sortedBy { it.miles }
    }

    private fun chainOf(name: String): Chain? {
        val n = name.lowercase()
        return CHAINS.firstOrNull { chain -> chain.needles.any { n.contains(it) } }
    }

    private fun get(url: String, userAgent: String = "AisleGrocery/1.0"): String? {
        val request = Request.Builder().url(url).header("User-Agent", userAgent).header("Accept", "application/json").build()
        return try {
            http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) null else response.body?.string()
            }
        } catch (_: Exception) {
            null
        }
    }
}

private fun milesBetween(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
    val r = { d: Double -> d * Math.PI / 180.0 }
    val earth = 3958.8
    val dLat = r(bLat - aLat)
    val dLon = r(bLon - aLon)
    val h = sin(dLat / 2) * sin(dLat / 2) + cos(r(aLat)) * cos(r(bLat)) * sin(dLon / 2) * sin(dLon / 2)
    return 2 * earth * asin(min(1.0, sqrt(h)))
}

private fun viewBox(lat: Double, lon: Double, miles: Double): String {
    val dLat = miles / 69.0
    val dLon = miles / (69.0 * cos(lat * Math.PI / 180.0).coerceAtLeast(0.2))
    return "${lon - dLon},${lat + dLat},${lon + dLon},${lat - dLat}"
}

private fun enc(value: String) = java.net.URLEncoder.encode(value, "UTF-8")
