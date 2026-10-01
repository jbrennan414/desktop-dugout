#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>
#include <Preferences.h>
#include <time.h>

const int RESTART_HOUR_LOCAL = 4;   // 4 AM local

const char* AP_NAME  = "DesktopDugout";
const char* API_BASE = "https://api.desktopdugout.com/";
const char* FW_VERSION = "1.0.3";

String userAgent() {
  return String("DesktopDugout@") + FW_VERSION;
}

struct TeamOption { const char* slug; const char* label; };
const TeamOption TEAMS[] = {
  {"diamondbacks", "Arizona Diamondbacks"},
  {"braves",       "Atlanta Braves"},
  {"athletics",    "Athletics"},
  {"orioles",      "Baltimore Orioles"},
  {"redsox",       "Boston Red Sox"},
  {"cubs",         "Chicago Cubs"},
  {"whitesox",     "Chicago White Sox"},
  {"reds",         "Cincinnati Reds"},
  {"guardians",    "Cleveland Guardians"},
  {"rockies",      "Colorado Rockies"},
  {"tigers",       "Detroit Tigers"},
  {"astros",       "Houston Astros"},
  {"royals",       "Kansas City Royals"},
  {"angels",       "Los Angeles Angels"},
  {"dodgers",      "Los Angeles Dodgers"},
  {"marlins",      "Miami Marlins"},
  {"brewers",      "Milwaukee Brewers"},
  {"twins",        "Minnesota Twins"},
  {"mets",         "New York Mets"},
  {"yankees",      "New York Yankees"},
  {"phillies",     "Philadelphia Phillies"},
  {"pirates",      "Pittsburgh Pirates"},
  {"padres",       "San Diego Padres"},
  {"giants",       "San Francisco Giants"},
  {"mariners",     "Seattle Mariners"},
  {"cardinals",    "St. Louis Cardinals"},
  {"rays",         "Tampa Bay Rays"},
  {"rangers",      "Texas Rangers"},
  {"bluejays",     "Toronto Blue Jays"},
  {"nationals",    "Washington Nationals"},
};
const int TEAM_COUNT = sizeof(TEAMS) / sizeof(TEAMS[0]);

LiquidCrystal_I2C lcd(0x27, 16, 2);
Preferences prefs;
String apiUrl;
String currentTeam;
unsigned long nextPollMs = 0;
WebServer adminServer(80);

bool isValidSlug(const String& s) {
  if (s.length() == 0) return false;
  for (int i = 0; i < TEAM_COUNT; i++) {
    if (s == TEAMS[i].slug) return true;
  }
  return false;
}

char cellFor(JsonVariant v) {
  if (v.isNull()) return '-';
  int n = v.as<int>();
  if (n < 0) return '-';
  if (n > 9) return '+';
  return '0' + n;
}

void renderGame(JsonObject game) {
  const char* awayTeam = game["away_team"] | "???";
  const char* homeTeam = game["home_team"] | "???";
  int awayScore = game["away_score"] | 0;
  int homeScore = game["home_score"] | 0;
  const char* status = game["status"] | "";
  JsonArray ls = game["linescore"].as<JsonArray>();

  bool isFinal = (strcmp(status, "final") == 0);

  char awayLine[10];
  char homeLine[10];

  if (isFinal) {
    strcpy(awayLine, "    FINAL");
    strcpy(homeLine, "         ");
  } else {
  memset(awayLine, ' ', 9); awayLine[9] = '\0';
  memset(homeLine, ' ', 9); homeLine[9] = '\0';

  int total = (int)ls.size();
  int start = total > 9 ? total - 9 : 0;   // slide to last 9 when in extras
  int count = total - start;                // <= 9
  for (int i = 0; i < count; i++) {
    awayLine[i] = cellFor(ls[start + i]["away"]);
    homeLine[i] = cellFor(ls[start + i]["home"]);
  }
}

  char row0[17], row1[17];
  snprintf(row0, sizeof(row0), "%-3.3s %s %2d", awayTeam, awayLine, awayScore);
  snprintf(row1, sizeof(row1), "%-3.3s %s %2d", homeTeam, homeLine, homeScore);

  lcd.setCursor(0, 0); lcd.print(row0);
  lcd.setCursor(0, 1); lcd.print(row1);
}

void showLcd(const char* line1, const char* line2 = "") {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(line1);
  lcd.setCursor(0, 1); lcd.print(line2);
}

void handleAdminPage() {
  String html = "<!doctype html><html><head><meta name='viewport' "
    "content='width=device-width,initial-scale=1'>"
    "<title>Desktop Dugout</title>"
    "<style>body{font-family:sans-serif;padding:20px;max-width:400px;margin:auto;}"
    "select,button{width:100%;padding:12px;font-size:1em;margin-top:8px;"
    "box-sizing:border-box;}"
    "button{background:#000;color:#fff;border:0;}"
    "label{display:block;margin-top:12px;font-weight:bold;}"
    ".current{color:#666;font-size:0.9em;margin-bottom:16px;}</style></head>"
    "<body><h1>Desktop Dugout</h1>";
  if (currentTeam.length() > 0) {
    html += "<p class='current'>Current team: <b>" + currentTeam + "</b><br>";
    html += "Firmware: <b>" + String(FW_VERSION) + "</b></p>";
  }
  html += "<form method='POST' action='/team'>"
          "<label>Team</label>"
          "<select name='team' required>"
          "<option value='' disabled selected>-- pick a team --</option>";
  for (int i = 0; i < TEAM_COUNT; i++) {
    html += "<option value='";
    html += TEAMS[i].slug;
    html += "'";
    if (currentTeam == TEAMS[i].slug) html += " selected";
    html += ">";
    html += TEAMS[i].label;
    html += "</option>";
  }
  html += "</select><button type='submit'>Save</button></form>";
  html += "<hr style='margin-top:24px;'>"
        "<form method='POST' action='/wifi-reset' "
        "onsubmit=\"return confirm('The scoreboard will reboot and reopen "
        "its setup network. Continue?');\">"
        "<button type='submit' style='background:#900;'>"
        "Change Wi-Fi network</button></form>";
  html += "</body></html>";
  adminServer.send(200, "text/html", html);
}

void handleAdminTeamSave() {
  String val = adminServer.arg("team");
  Serial.printf(">> admin /team posted, team='%s'\n", val.c_str());
  if (!isValidSlug(val)) {
    adminServer.send(400, "text/plain", "Invalid team");
    return;
  }
  prefs.putString("team", val);
  currentTeam = val;
  apiUrl = String(API_BASE) + currentTeam;
  nextPollMs = 0;
  String ok = "<html><body style='font-family:sans-serif;padding:20px;'>"
              "<h1>Saved!</h1><p>Team set to <b>" + val + "</b>.</p>"
              "<p><a href='/'>&larr; back</a></p></body></html>";
  adminServer.send(200, "text/html", ok);
}

void handleAdminWifiReset() {
  Serial.println(">> admin /wifi-reset POST — clearing Wi-Fi and rebooting");
  prefs.remove("ssid");
  prefs.remove("pass");
  String ok = "<html><body style='font-family:sans-serif;padding:20px;'>"
              "<h1>Wi-Fi cleared</h1>"
              "<p>The device is rebooting. Look for the "
              "<b>DesktopDugout</b> network on your phone in a few seconds "
              "to reconnect.</p></body></html>";
  adminServer.send(200, "text/html", ok);
  delay(1500);   // let the browser receive the response
  ESP.restart();
}

void startAdminServer() {
  adminServer.on("/wifi-reset", HTTP_POST, handleAdminWifiReset);
  adminServer.on("/", HTTP_GET, handleAdminPage);
  adminServer.on("/team", HTTP_POST, handleAdminTeamSave);
  adminServer.begin();
  Serial.printf(">> admin at http://%s/\n",
                WiFi.localIP().toString().c_str());
}

// Ask the backend if there's a newer firmware, and if so, pull + flash it.
// On success the device reboots into the new firmware; we don't return.
void checkForFirmwareUpdate() {
  Serial.printf("[ota] current version %s, checking for update\n", FW_VERSION);

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, String(API_BASE) + "firmware/latest");
  http.setUserAgent(userAgent());
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[ota] manifest HTTP %d\n", code);
    http.end();
    return;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getString());
  http.end();
  if (err) {
    Serial.println("[ota] manifest parse failed");
    return;
  }

  const char* latestVer = doc["version"] | "";
  const char* url       = doc["url"]     | "";
  // Backend returns sha256; ESP32 HTTPUpdate can't verify it directly.
  // Integrity relies on HTTPS + CloudFront + private S3 bucket for now.

  if (strlen(latestVer) == 0 || strlen(url) == 0) {
    Serial.println("[ota] manifest missing fields");
    return;
  }
  if (strcmp(latestVer, FW_VERSION) == 0) {
    Serial.println("[ota] up to date");
    return;
  }

  Serial.printf("[ota] update available: %s -> %s\n", FW_VERSION, latestVer);
  showLcd("updating...", latestVer);

  WiFiClientSecure updateClient;
  updateClient.setInsecure();
  httpUpdate.rebootOnUpdate(true);

  t_httpUpdate_return ret = httpUpdate.update(updateClient, url);

  switch (ret) {
    case HTTP_UPDATE_FAILED:
      Serial.printf("[ota] failed: %s\n",
                    httpUpdate.getLastErrorString().c_str());
      showLcd("update failed", "resuming...");
      delay(2000);
      break;
    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("[ota] no update (server said no)");
      break;
    case HTTP_UPDATE_OK:
      break;
  }
}

String scanNetworksHtml() {
  int n = WiFi.scanNetworks();
  String html;
  for (int i = 0; i < n; i++) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;
    html += "<option value='";
    html += ssid;
    html += "'>";
    html += ssid;
    html += "</option>";
  }
  WiFi.scanDelete();
  return html;
}

struct SetupResult { String ssid; String pass; String team; bool ok; };

SetupResult runSetupPortal() {
  SetupResult result{"", "", "", false};

  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_NAME);
  IPAddress apIP = WiFi.softAPIP();
  Serial.printf(">> AP up at %s\n", apIP.toString().c_str());

  DNSServer dns;
  dns.setErrorReplyCode(DNSReplyCode::NoError);
  dns.start(53, "*", apIP);

  WebServer server(80);

  auto sendPortalPage = [&]() {
    String networks = scanNetworksHtml();
    String html = "<!doctype html><html><head><meta name='viewport' "
      "content='width=device-width,initial-scale=1'>"
      "<title>Desktop Dugout Setup</title>"
      "<style>body{font-family:sans-serif;padding:20px;max-width:400px;margin:auto;}"
      "input,select,button{width:100%;padding:12px;font-size:1em;margin-top:8px;"
      "box-sizing:border-box;}"
      "button{background:#000;color:#fff;border:0;}"
      "label{display:block;margin-top:12px;font-weight:bold;}</style></head>"
      "<body><h1>Desktop Dugout</h1>"
      "<form method='POST' action='/save'>"
      "<label>Wi-Fi network</label>"
      "<select name='ssid' required>"
      "<option value='' disabled selected>-- pick a network --</option>";
    html += networks;
    html += "</select>"
            "<label>Password</label>"
            "<input id='pass' name='pass' type='password' placeholder='wifi password'>"
            "<label style='font-weight:normal;margin-top:6px;'>"
            "<input type='checkbox' style='width:auto;margin-right:6px;vertical-align:middle;' "
            "onchange=\"document.getElementById('pass').type=this.checked?'text':'password'\">"
            "Show password</label>"
            "<label>Team</label>"
            "<select name='team' required>"
            "<option value='' disabled selected>-- pick a team --</option>";
    for (int i = 0; i < TEAM_COUNT; i++) {
      html += "<option value='";
      html += TEAMS[i].slug;
      html += "'>";
      html += TEAMS[i].label;
      html += "</option>";
    }
    html += "</select><button type='submit'>Save</button></form></body></html>";
    server.send(200, "text/html", html);
  };

  server.on("/", HTTP_GET, sendPortalPage);
  server.on("/generate_204", HTTP_GET, sendPortalPage);
  server.on("/hotspot-detect.html", HTTP_GET, sendPortalPage);
  server.on("/connecttest.txt", HTTP_GET, sendPortalPage);
  server.on("/ncsi.txt", HTTP_GET, sendPortalPage);
  server.onNotFound(sendPortalPage);

  server.on("/save", HTTP_POST, [&]() {
    String ssid = server.arg("ssid");
    String pass = server.arg("pass");
    String team = server.arg("team");
    Serial.printf(">> /save posted, ssid='%s' team='%s'\n",
                  ssid.c_str(), team.c_str());

    if (ssid.length() == 0 || !isValidSlug(team)) {
      server.send(400, "text/plain", "Missing SSID or invalid team");
      return;
    }

    result.ssid = ssid;
    result.pass = pass;
    result.team = team;
    result.ok = true;

    String ok = "<html><body style='font-family:sans-serif;padding:20px;'>"
                "<h1>Saved!</h1>"
                "<p>Connecting to <b>" + ssid + "</b>...</p>"
                "<p>You can close this page.</p></body></html>";
    server.send(200, "text/html", ok);
  });

  server.begin();
  Serial.println(">> setup portal ready");

  unsigned long startMs = millis();
  while (!result.ok && millis() - startMs < 300000) {
    dns.processNextRequest();
    server.handleClient();
    delay(2);
  }

  unsigned long extraMs = millis();
  while (millis() - extraMs < 1200) {
    dns.processNextRequest();
    server.handleClient();
    delay(2);
  }

  server.stop();
  dns.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  return result;
}

void setup() {
  configTzTime("MST7MDT,M3.2.0,M11.1.0", "pool.ntp.org", "time.nist.gov");
  Serial.begin(115200);
  Serial.printf(">> fw version %s\n", FW_VERSION);
  Wire.begin(21, 22);
  lcd.init();
  delay(50);
  lcd.backlight();
  showLcd("starting...");

  // Show firmware version briefly on boot.
  {
    char row1[17];
    snprintf(row1, sizeof(row1), "v%s", FW_VERSION);
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("firmware:");
    lcd.setCursor(0, 1); lcd.print(row1);
    delay(3000);
  }

  prefs.begin("dugout", false);

  pinMode(0, INPUT_PULLUP);
  delay(50);
  if (digitalRead(0) == LOW) {
    showLcd("resetting", "settings...");
    prefs.clear();
    prefs.begin("dugout", false);
    WiFi.disconnect(true, true);
    delay(1500);
  }

  currentTeam = prefs.getString("team", "");
  String savedSsid = prefs.getString("ssid", "");
  String savedPass = prefs.getString("pass", "");
  Serial.printf(">> stored team='%s' ssid='%s'\n",
                currentTeam.c_str(), savedSsid.c_str());

  bool connected = false;

  if (savedSsid.length() > 0 && currentTeam.length() > 0) {
    char buf[17];
    snprintf(buf, sizeof(buf), "wifi: %s", savedSsid.c_str());
    showLcd("connecting...", buf);
    WiFi.mode(WIFI_STA);
    WiFi.begin(savedSsid.c_str(), savedPass.c_str());
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
      delay(200);
    }
    connected = (WiFi.status() == WL_CONNECTED);
  }

  if (!connected) {
    showLcd("wifi setup:", AP_NAME);
    SetupResult r = runSetupPortal();
    if (!r.ok) {
      showLcd("setup timed out", "rebooting...");
      delay(2000);
      ESP.restart();
    }

    prefs.putString("ssid", r.ssid);
    prefs.putString("pass", r.pass);
    prefs.putString("team", r.team);
    currentTeam = r.team;

    showLcd("connecting...", r.ssid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.begin(r.ssid.c_str(), r.pass.c_str());
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
      delay(200);
    }
    if (WiFi.status() != WL_CONNECTED) {
      showLcd("wifi failed", "rebooting...");
      delay(2000);
      ESP.restart();
    }
  }

  apiUrl = String(API_BASE) + currentTeam;
  Serial.printf(">> ready, api=%s ip=%s\n",
                apiUrl.c_str(), WiFi.localIP().toString().c_str());

  // Screen 1: team + SSID, 3 seconds.
  char row0[17], row1[17];
  snprintf(row0, sizeof(row0), "team: %s", currentTeam.c_str());
  snprintf(row1, sizeof(row1), "%s", WiFi.SSID().c_str());
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(row0);
  lcd.setCursor(0, 1); lcd.print(row1);
  delay(3000);

  // Screen 2: admin URL, 5 seconds.
  snprintf(row0, sizeof(row0), "setup: http://");
  snprintf(row1, sizeof(row1), "%s", WiFi.localIP().toString().c_str());
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(row0);
  lcd.setCursor(0, 1); lcd.print(row1);
  delay(5000);

  startAdminServer();
}

void checkDailyRestart() {
  static unsigned long lastCheckMs = 0;
  static int lastRestartDay = -1;

  if (millis() - lastCheckMs < 60000) return;
  lastCheckMs = millis();

  struct tm now;
  if (!getLocalTime(&now, 0)) return;

  if (now.tm_hour == RESTART_HOUR_LOCAL && now.tm_mday != lastRestartDay) {
    lastRestartDay = now.tm_mday;
    checkForFirmwareUpdate();
    Serial.println("[maint] scheduled daily restart");
    delay(1000);
    ESP.restart();
  }
}

void loop() {
  adminServer.handleClient();
  checkDailyRestart();
  if (millis() < nextPollMs) return;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, apiUrl);
  http.setUserAgent(userAgent());
  int code = http.GET();

  if (code == 200) {
    JsonDocument doc;
    if (!deserializeJson(doc, http.getString())) {
      renderGame(doc["game"].as<JsonObject>());
      unsigned long next = doc["next_poll_ms"] | 10000;
      Serial.printf("rendered, next in %lums\n", next);
      nextPollMs = millis() + next;
    } else {
      Serial.println("json parse failed");
      nextPollMs = millis() + 5000;
    }
  } else {
    Serial.printf("HTTP %d\n", code);
    nextPollMs = millis() + 5000;
  }
  http.end();
}