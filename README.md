## dev
npm install
node app.js

## build 
npm run build

## guide
1. Copy the `acc_ranklist_web.exe` and `config.yaml` to your Windows server.
2. Edit the `config.yaml`, except for the "server_path", which should be the path to your ACC server, including a "results" folder.
3. Enable the "dumpLeaderboards" setting in your ACC server.
4. Run `acc_ranklist_web.exe`.
5. Open http://localhost:9543 in your browser. You can also edit the `config.yaml` to change the "port".