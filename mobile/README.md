# CampusLoop — Android APK (Capacitor wrapper)

CampusLoop is a Progressive Web App: on any Android phone, open the server URL in Chrome and tap
**⋮ → Install app / Add to Home screen**. It installs with its own icon, opens full-screen and works offline for saved screens.

If the judges need a real `.apk`:

1. Install Android Studio (with an SDK) and Node 18+.
2. Start the server on your laptop (`npm start` in the project root) and note the **Phone:** URL it prints, e.g. `http://192.168.1.10:3000`.
3. Put that URL in `capacitor.config.json → server.url`.
4. In this folder run:
   ```bash
   npm run setup      # installs Capacitor and creates the android/ project
   npm run sync
   npm run open       # opens Android Studio → Build → Build APK(s)
   ```
The APK loads the live CampusLoop server, so phone and laptop share the same data in the demo.
For production, host the server over HTTPS and set `server.url` to that domain (and remove `cleartext`).
