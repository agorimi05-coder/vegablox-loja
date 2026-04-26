# Vegablox Online

Base pronta para deploy na Vercel com frontend estatico e APIs serverless.

## Estrutura

- `index.html`: pagina atual do site.
- `api/roblox/user.js`: valida usuario Roblox e retorna dados basicos + avatar.
- `api/pix/create.js`: cria QR Code Pix no gateway BlackCatPay/BlackOnPay.
- `api/pix/webhook.js`: recebe notificacoes do gateway.
- `api/pix/status.js`: consulta status se o gateway liberar endpoint especifico.
- `vercel.json`: rewrite para SPA e preserva rotas `/api/*`.

## Variaveis na Vercel

Crie estas variaveis em Project Settings > Environment Variables:

```txt
BLACKCATPAY_CLIENT_ID
BLACKCATPAY_CLIENT_SECRET
BLACKCATPAY_API_URL
BLACKCATPAY_STATUS_URL
BLACKCATPAY_DEFAULT_NAME
BLACKCATPAY_DEFAULT_CPF
WEBHOOK_SECRET
APP_URL
```

`BLACKCATPAY_API_URL` pode ficar como `https://dash.blackonpay.com/v3/pix/qrcode`.
Use `APP_URL` com o dominio final da Vercel ou dominio proprio.
Se o checkout nao pedir CPF, configure `BLACKCATPAY_DEFAULT_CPF` com o documento aprovado no seu gateway.

## Endpoints

### Verificar usuario Roblox

```http
GET /api/roblox/user?username=builderman
```

Retorna `id`, `name`, `displayName` e `avatarUrl`.

### Criar Pix

```http
POST /api/pix/create
Content-Type: application/json

{
  "nick": "builderman",
  "amount": 10.9,
  "productId": "robux_pack",
  "productName": "Pacote Vegablox"
}
```

### Webhook

Configure no gateway:

```txt
https://seu-dominio.vercel.app/api/pix/webhook?secret=WEBHOOK_SECRET
```

O webhook atual valida o segredo e responde OK. Para entrega automatica, conecte aqui banco de dados, fila ou painel administrativo.
