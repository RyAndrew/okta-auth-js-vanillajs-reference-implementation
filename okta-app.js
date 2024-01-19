/**
 * Documentation:
 * https://github.com/okta/okta-auth-js
 * https://developer.okta.com/code/javascript/okta_auth_sdk/
 */
"use strict";

var oktaAuthInstance = new OktaAuth(config)

window.onload = function () {
    initSpaApp()
}

var tokenRefreshCount = 0
var oktaSessionExpires = null
var oktaSessionLastCheck = null

async function initSpaApp() {

    debugLogger('initSpaApp!')
    outputConfigToDebugLogger()

    oktaAuthInstance.authStateManager.subscribe(function (authState) {
        debugLogger(`authStateManager Event! authState.isAuthenticated=${authState.isAuthenticated}`)

        if (authState.isAuthenticated) {
            // Render authenticated view
            debugLogger('Logged in!')
            showTokenInfo()
        } else {
            // Render unathenticated view
            debugLogger('NOT logged in!')
            updateUiAuthenticatedStatus(false)
        }
    })

    debugLogger('check oktaAuthInstance.isLoginRedirect()')
    if (oktaAuthInstance.isLoginRedirect()) {
        debugLogger('Yes Redirect')
        try {
            await oktaAuthInstance.handleRedirect()
        } catch (err) {
            // log or display error details
            debugLogger('Error fetching tokens', err)
            setInnerText('error', err)
        }
    } else {
        debugLogger('Not Redirect')
        startOktaService()
    }

    attachIdleDetectionEventHandlers()

    runFiveMinTimer()

    addVisibilityListeners()

    checkOktaSession()

    startOktaService()
}

async function startOktaService() {
    debugLogger('oktaAuthInstance.start()')
    await oktaAuthInstance.start()
}

async function stopOktaService() {
    debugLogger('oktaAuthInstance.stop()')
    await oktaAuthInstance.stop()
}

async function reastartOktaService() {
    await stopOktaService()
    await startOktaService()
}

function attachIdleDetectionEventHandlers() {

    document.addEventListener("keyup", (event) => {
        restartIdleTimerThrottled("keyup")
    })
    document.addEventListener("mousemove", (event) => {
        restartIdleTimerThrottled("mousemove")
    })
    document.addEventListener("touchstart", (event) => {
        restartIdleTimerThrottled("touchstart")
    })
    document.addEventListener("scroll", (event) => {
        restartIdleTimerThrottled("scroll")
    })
    restartIdleTimerThrottled("page load")
}

function addVisibilityListeners() {
    document.addEventListener("visibilitychange", () => {
        debugLogger('Event! visibilitychange')
        if (!document.hidden) {
            debugLogger('Visibility restored - updateAuthState() & check okta session')
            oktaAuthInstance.authStateManager.updateAuthState()
            checkIfOktaSessionExistsOrExpired()
        } else {
            debugLogger('Visibility hidden')
        }
    })

    //see https://developer.chrome.com/docs/web-platform/page-lifecycle-api
    // window.addEventListener('unload', function(event) {
    //     debugLogger('Event! unload')
    //     //noop!
    //     //having this event ensures when the back button is clicked the page reloads
    // })
    window.addEventListener('pageshow', function(event) {
        debugLogger('Event! pageshow')
    })
    window.addEventListener('pagehide', function(event) {
        debugLogger('Event! pagehide')
    })
}

async function debugOktaServices(){
    //debug per https://github.com/okta/okta-auth-js/issues/1164
    let debugData = {
        syncStorage_CanStart: oktaAuthInstance.serviceManager.services.get('syncStorage').canStart(),
        syncStorage_isStarted: oktaAuthInstance.serviceManager.services.get('syncStorage').isStarted(), 
        autoRenew_CanStart: oktaAuthInstance.serviceManager.services.get('autoRenew').canStart(),
        autoRenew_isStarted: oktaAuthInstance.serviceManager.services.get('autoRenew').isStarted(),
        autoRenew_requiresLeadership: oktaAuthInstance.serviceManager.services.get('autoRenew').requiresLeadership(),
        leaderElection_isLeader: oktaAuthInstance.serviceManager.services.get('leaderElection')?.elector?.isLeader || null,
        leaderElection_isDead: oktaAuthInstance.serviceManager.services.get('leaderElection')?.elector?.isDead || null,
        leaderElection_hasLeader: await oktaAuthInstance.serviceManager.services.get('leaderElection')?.elector?.hasLeader()  || null,
        leaderElection_type: oktaAuthInstance.serviceManager.services.get('leaderElection')?.elector?.broadcastChannel?.method?.type  || null,
    }
    debugLogger('debugOktaServices',debugData)
}

oktaAuthInstance.tokenManager.on('expired', function (key, expiredToken) {
    debugLogger(`Token with key ${key} has expired`)
    console.log('Expired Token:', expiredToken)
})

oktaAuthInstance.tokenManager.on('renewed', function (key, newToken, oldToken) {
    debugLogger(`Token with key ${key} has been renewed`)
    console.log('New Token:', newToken)
    if (key === 'accessToken') {
        tokenRefreshCount++
        updateTokenRefreshCount()
        updateExpire(newToken)
        runFiveMinTimer()
    }
})

oktaAuthInstance.tokenManager.on('error', function (err) {
    debugLogger('TokenManager Error!', err)
})

function checkOktaSession() {

    oktaSessionLastCheck = new Date()

    //check if okta session is active currently
    oktaAuthInstance.session.get()
        .then(function (session) {
            debugLogger('Okta sessions/me response', convertSessionDataUtcStringsToLocaleDates(session))
                
            showSessionStatus(session)

            if(session?.status === 'ACTIVE'){
                oktaSessionExpires = new Date(session.expiresAt)
            }else{
                oktaSessionExpires = null
            }
        })
        .catch(function (err) {
            debugLogger('failed to get okta session', err)
            showSessionStatus('Failed to get session')
            setInnerText('error', err)
        })
}
function checkIfOktaSessionExistsOrExpired() {
    debugLogger('checking if okta session exists or expired')
    if(oktaSessionExpires === null){
        debugLogger('okta session does no exist, verify with okta')
        checkOktaSession()
    }else{
        if((new Date()) >= oktaSessionExpires){
            debugLogger('okta session expired, verify with okta')
            checkOktaSession()
        }else{
            debugLogger('okta session is active')

            //if the session is active - check it if more than 5 minutes since the last check have elapsed and verify if session still exists
            
            let lastCheckDelta = ((new Date()) - oktaSessionLastCheck).valueOf()
            debugLogger(`last okta session check was ${(lastCheckDelta/1000).toFixed(2)} seconds ago`)

            if(lastCheckDelta >= 5*60*1000){//5 minutes
                debugLogger(`last okta session check was >= 5 minutes, checking!`)
                checkOktaSession()
            }else{
                debugLogger(`last okta session check was < 5 minutes, skipping!`)
            }
        }
    }
}

function showSessionStatus(session) {
    const statusContainer = document.getElementById("session-status")

    if (session?.status === 'ACTIVE') {
        statusContainer.innerHTML = session.status
        showElement('session-expires-container')
        showElement('session-close')
        document.getElementById("session-expires").innerHTML = convertUtcStringToDateTimeString(session.expiresAt)
    } else {
        statusContainer.innerHTML = 'INACTIVE'
        hideElement('session-expires-container')
        hideElement('session-close')
    }
}

function showTokenInfo() {
    oktaAuthInstance.tokenManager.get('accessToken').then(accessToken => {
        if (accessToken) {
            debugLogger('Token storage has Access Token')
            console.log(accessToken)

            updateExpire(accessToken)
        } else {
            debugLogger('Token storage DOES NOT have Access Token')
            updateExpire(null)
        }
    })
    oktaAuthInstance.tokenManager.get('idToken').then(idToken => {
        if (idToken) {
            debugLogger('Token storage has ID Token')
            console.log(idToken)

            updateUiAuthenticatedStatus(true, idToken)
        } else {
            debugLogger('Token storage DOES NOT have ID Token')
        }
    })
}

function clickSignIn() {
    debugLogger('Clicked Sign In')
    oktaAuthInstance.token.getWithRedirect({scopes: config.scopes})
        .catch(function (err) {

            // handle OAuthError or AuthSdkError (AuthSdkError will be thrown if app is in OAuthCallback state)
            console.error('Sign In Error!', err)
            alert(err)
        })
}

function clickRefreshTokens() {
    debugLogger('Clicked Refresh tokens')
    oktaAuthInstance.tokenManager.renew('accessToken')
        .then(function (newToken) {
            //debugLogger('Access Token Manually Refreshed!', newToken)
            updateExpire(newToken)
        }).catch(function (err) {
        debugLogger('Manual Token refresh error!', err)
    })

}

function clickClearAllTokens() {
    debugLogger('Clicked Clear all tokens')
    oktaAuthInstance.tokenManager.clear()
}

function clickSignOut() {
    oktaAuthInstance.signOut({
        postLogoutRedirectUri: location.protocol.concat("//").concat(window.location.host)
    })
    oktaAuthInstance.tokenManager.clear()
    updateUiAuthenticatedStatus(false)
}

function clickCloseSession() {
    debugLogger('Clicked Close Okta Session')
    oktaAuthInstance.session.close().then(() => {
        checkOktaSession()
    }).catch(function (err) {
        debugLogger('Error closing session', err)
        setInnerText('error', err)
    })
}

function setInnerText(elementId, text) {
    document.getElementById(elementId).innerText = text
}

function hideElement(id) {
    document.getElementById(id).classList.add('hide-element')
}

function showElement(id) {
    document.getElementById(id).classList.remove('hide-element')
}

// Update the UI to reflect being signed in or not
function updateUiAuthenticatedStatus(authenticated, idToken) {

    if (authenticated) {
        hideElement('logged-out-cointainer')
        showElement('logged-in-cointainer')
        setInnerText('name', idToken.claims.name) //provided by profile scope
        setInnerText('email', idToken.claims.email) //provided by email scope
    } else {
        showElement('logged-out-cointainer')
        hideElement('logged-in-cointainer')
        setInnerText('name', '')
        setInnerText('email', '')
        clickHideTokens()
    }
}

async function clickShowTokens() {
    debugLogger('Click Show Tokens')

    hideElement('show-tokens')
    showElement('hide-tokens')

    const tokens = await oktaAuthInstance.tokenManager.getTokens()
    console.log(tokens)

    document.getElementById("tokens").innerHTML = formatTokenOutput(tokens)
}

function clickHideTokens() {
    debugLogger('Hide Tokens')

    showElement('show-tokens')
    hideElement('hide-tokens')

    document.getElementById("tokens").innerHTML = ''
}

function clickShowLog() {
    showElement('hide-debug-log')
    hideElement('show-debug-log')

    showElement('debug-log')
    debugOktaServices()
}

function clickHideLog() {
    showElement('show-debug-log')
    hideElement('hide-debug-log')

    hideElement('debug-log')
}

function formatTokenOutput(tokenObj) {
    let output = ''
    for (let token in tokenObj) {
        if (token === 'refreshToken') {
            output += `<PRE><B>${token}</B><BR />${JSON.stringify(convertClaimsUtcToLocaleDates(tokenObj[token]), null, 4)}</PRE>`
        } else {
            output += `<PRE><B>${token}</B><BR />${JSON.stringify(convertClaimsUtcToLocaleDates(tokenObj[token].claims), null, 4)}</PRE>`
        }
    }
    return output
}

function convertClaimsUtcToLocaleDates(token) {
    const timeClaims = ['iat', 'exp', 'expiresAt', 'auth_time']

    //make copy of token
    let formattedToken = {}

    for (let claim in token) {
        if (timeClaims.includes(claim)) {
            formattedToken[claim] = token[claim] + ' (' + convertTimeStampToDateTimeString(token[claim]) + ')'
        } else {
            formattedToken[claim] = token[claim]
        }
    }
    return formattedToken
}

function convertSessionDataUtcStringsToLocaleDates(token) {
    const timeClaims = ['createdAt', 'expiresAt', 'lastPasswordVerification', 'lastFactorVerification']

    //make copy of token
    let formattedToken = {}

    for (let claim in token) {
        if (timeClaims.includes(claim)) {
            formattedToken[claim] = token[claim] + ' (' + convertUtcStringToDateTimeString(token[claim]) + ')'
        } else {
            formattedToken[claim] = token[claim]
        }
    }
    return formattedToken
}

function convertTimeStampToDateTimeString(timestamp) {
    let dateToFormat = new Date(parseInt(timestamp, 10) * 1000)
    return dateToFormat.toLocaleDateString() + ' ' + dateToFormat.toLocaleTimeString()
}

function convertUtcStringToDateTimeString(utcString) {
    let dateToFormat = new Date(utcString)
    return dateToFormat.toLocaleDateString() + ' ' + dateToFormat.toLocaleTimeString()
}

function getDateLocaleString(){
    let dateToFormat = new Date()
    return dateToFormat.toLocaleDateString() + ' ' + dateToFormat.toLocaleTimeString()
}

function updateExpire(accessToken) {
    if (accessToken) {
        setInnerText('expire', convertTimeStampToDateTimeString(accessToken.expiresAt))
    } else {
        setInnerText('expire', '')
    }
}

function checkUrlToTriggerLogin() {
    if (window.location.href.indexOf("login") != -1) {
        clickSignIn()
    }
}

function startCountUpTimer(element) {
    let timer, minutes, seconds
    timer = 0
    return setInterval(function () {
        minutes = parseInt(timer / 60, 10)
        seconds = parseInt(timer % 60, 10)

        minutes = minutes < 10 ? "0" + minutes : minutes
        seconds = seconds < 10 ? "0" + seconds : seconds

        element.textContent = minutes + ":" + seconds

        timer++
    }, 1000)
}

function startCountDownTimer(duration, element) {
    var timer = duration, minutes, seconds
    return setInterval(function () {
        minutes = parseInt(timer / 60, 10)
        seconds = parseInt(timer % 60, 10)

        minutes = minutes < 10 ? "0" + minutes : minutes
        seconds = seconds < 10 ? "0" + seconds : seconds

        element.textContent = minutes + ":" + seconds

        if (--timer < 0) {
            timer = duration
        }
    }, 1000)
}

let fiveMinuteTimer = null

function runFiveMinTimer() {
    let fiveMinutes = 5 * 60
    let display = document.querySelector('#timer')
    if (fiveMinuteTimer !== null) {
        clearInterval(fiveMinuteTimer)
    }
    fiveMinuteTimer = startCountDownTimer(fiveMinutes, display)
}

let idleTimer = null

function restartIdleTimer(type) {

    //debugLogger('Restart Idle Timer '+type)

    let twoMinutes = 2 * 60
    let display = document.querySelector('#idletimer')
    display.textContent = '00:00'

    if (idleTimer !== null) {
        clearInterval(idleTimer)
    }

    idleTimer = startCountUpTimer(display)
}

function throttle(callback, delay = 500) { //default throttle is call function once every 500ms
    let timerFlag = null // Variable to keep track of the timer

    // Returning a throttled version
    return (...args) => {
        if (timerFlag === null) { // If there is no timer currently running
            setTimeout(()=>{
                callback(...args) // Execute the main function
            },1) //go 1 tick
            timerFlag = setTimeout(() => { // Set a timer to clear the timerFlag after the specified delay
                timerFlag = null // Clear the timerFlag to allow the main function to be executed again
            }, delay)
        }
        return true
    }
}

const restartIdleTimerThrottled = throttle(restartIdleTimer)

function debugLogger() {
    let timeString = getDateLocaleString()
    console.log(timeString,...arguments)

    let logStringToAppend = ''
    for (let arg of arguments) {
        if (typeof arg === 'object') {
            arg = JSON.stringify(arg, null, 4)
        }
        logStringToAppend += timeString +' '+ arg + '\r\n'
    }
    document.getElementById('debug-log').innerHTML += logStringToAppend
}

function updateTokenRefreshCount() {
    debugLogger(`updateTokenRefreshCount to ${tokenRefreshCount}`)
    if (tokenRefreshCount > 0) {
        showElement('token-refresh-container')
        setInnerText('token-refresh-count', tokenRefreshCount)
    } else {
        hideElement('token-refresh-container')
    }
}

function outputConfigToDebugLogger(){

    debugLogger('Okta Config:')
    let tenant = new URL(config.issuer)
    tenant = tenant.protocol +'//'+ tenant.hostname
    debugLogger(`Tenant: <a href="${tenant}">${tenant}</a>`)
    debugLogger(config)
}

window.addEventListener("unhandledrejection", (event) => {
  debugLogger(`UNHANDLED PROMISE REJECTION: ${event.reason}`, event)
})
window.addEventListener("error", (event) => {
  debugLogger('Window Error!', event)
})