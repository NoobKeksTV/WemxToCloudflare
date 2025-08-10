# WemxToCloudflare

This App acts as a safe "man in the middle" software so that our frontend/e-commerce backend can safely request CF domains without exposing sensitive data such as your Cloudflare API Keys to the E-Commerce Software in case of a Breach.

Built on Windows, you might have to reinstall the node packages. 
Used Packages: `request, express, dotenv`


---

How To use:

Send a request to this API: `http://localhost:9765/getAndCreateDomain` , Insert Header "Authorization" with the Auth Key from the .env file, add the following data as json: `ogTarget, ogPort, service`.
ogTarget: The original Domain / IP of a Server
ogPort: The original Port of a Server
service: The type of Service/Software running on there e.g. "minecraft" or "teamspeak" or "sip".

**CURRENTLY ONLY SUPPORTS MINECRAFT NATIVELY**

Send the Request as a `POST` request and be presented with a random subdomain being added to your CF Account and get that domain as a string.



