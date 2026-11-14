# Gannyland backend

Independent API service. Frontend is a separate sibling application in `../frontend/`.

```sh
cd backend
npm install
cp .env.example .env.local
# Fill local credentials, then:
npm run dev
```

API: http://localhost:4000/api/health

See [setup and API documentation](docs/README.md). Run `npm run test:all`, `npm run typecheck`, `npm run lint`, and `npm run build` here.
