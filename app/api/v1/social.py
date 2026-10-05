import secrets

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["social"])

GRAPH = "https://graph.facebook.com/v21.0"


def _rand_state() -> str:
    return secrets.token_urlsafe(16)


@router.get("/instagram")
async def instagram_auth():
    """Redirect to Meta's OAuth dialog."""
    state = _rand_state()
    params = {
        "client_id": settings.instagram_app_id,
        "redirect_uri": settings.instagram_redirect_uri,
        "state": state,
        "response_type": "code",
        "scope": "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement",
    }
    url = f"https://www.facebook.com/v21.0/dialog/oauth?{httpx.QueryParams(params)}"
    response = RedirectResponse(url=url)
    response.set_cookie(key="oauth_state", value=state, httponly=True, max_age=600)
    return response


@router.get("/instagram/callback")
async def instagram_callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
):
    """Handle the OAuth callback, exchange code for tokens, print for .env."""
    cookie_state = request.cookies.get("oauth_state")
    if not cookie_state or cookie_state != state:
        raise HTTPException(status_code=400, detail="Invalid CSRF state")

    if not settings.instagram_app_id or not settings.instagram_app_secret:
        raise HTTPException(status_code=500, detail="Instagram app not configured")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Exchange code for short-lived user token
        token_resp = await client.post(
            f"{GRAPH}/oauth/access_token",
            params={
                "client_id": settings.instagram_app_id,
                "client_secret": settings.instagram_app_secret,
                "redirect_uri": settings.instagram_redirect_uri,
                "code": code,
            },
        )
        if token_resp.status_code >= 400:
            raise HTTPException(status_code=400, detail=f"Token exchange failed: {token_resp.text}")
        short_token = token_resp.json().get("access_token")
        if not short_token:
            raise HTTPException(status_code=400, detail="No access token in response")

        # 2. Exchange for long-lived user token (~60 days)
        ll_resp = await client.post(
            f"{GRAPH}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": settings.instagram_app_id,
                "client_secret": settings.instagram_app_secret,
                "fb_exchange_token": short_token,
            },
        )
        if ll_resp.status_code >= 400:
            raise HTTPException(status_code=400, detail=f"Long-lived token exchange failed: {ll_resp.text}")
        long_token = ll_resp.json().get("access_token")
        if not long_token:
            raise HTTPException(status_code=400, detail="No long-lived token in response")

        # 3. Get user's pages with page tokens
        pages_resp = await client.get(
            f"{GRAPH}/me/accounts",
            params={"fields": "id,name,access_token", "access_token": long_token},
        )
        if pages_resp.status_code >= 400:
            raise HTTPException(status_code=400, detail=f"Pages fetch failed: {pages_resp.text}")
        pages = pages_resp.json().get("data", [])
        if not pages:
            raise HTTPException(status_code=400, detail="No Facebook pages found for this user")

        # 4. Find the IG business account for each page
        ig_account = None
        page_id = None
        page_token = None
        for page in pages:
            pid = page.get("id")
            pt = page.get("access_token")
            if not pid or not pt:
                continue
            ig_resp = await client.get(
                f"{GRAPH}/{pid}",
                params={"fields": "instagram_business_account", "access_token": pt},
            )
            if ig_resp.status_code >= 400:
                continue
            ig_data = ig_resp.json().get("instagram_business_account")
            if ig_data:
                ig_account = ig_data.get("id")
                page_id = pid
                page_token = pt
                break

        if not ig_account or not page_token:
            raise HTTPException(status_code=400, detail="No Instagram Business account found for connected pages")

    # Print results for user to copy into .env
    print("\n" + "=" * 60)
    print("INSTAGRAM CONNECTED - COPY THESE INTO YOUR .env FILE")
    print("=" * 60)
    print(f"INSTAGRAM_ACCESS_TOKEN={page_token}")
    print(f"INSTAGRAM_BUSINESS_ACCOUNT_ID={ig_account}")
    print(f"# Page ID: {page_id}")
    print("=" * 60 + "\n")

    # Redirect to settings with success flag
    return RedirectResponse(url="/app/#settings?ig=connected")