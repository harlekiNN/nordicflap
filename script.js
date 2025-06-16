// Get canvas and its 2D rendering context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state variables
let gameRunning = false;
let gameOver = false;
let score = 0;

// UI elements
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const scoreDisplay = document.getElementById('scoreDisplay');
const finalScoreDisplay = document.getElementById('finalScore');
const loadingText = document.getElementById('loadingText');

// --- Asset Loading ---
const assets = {};
const assetSources = {
    background: 'assets/nordic_background_generated.png',
    pipeBottom: 'assets/obstacle_bottom_roots.png',
    pipeTop: 'assets/obstacle_top_column.png',
    raven: 'assets/raven_generated.png',
    ravenFlap: 'assets/raven_generated_flap.png',
    ground: 'assets/ground_strip.png',
};

function loadAssets() {
    const promises = [];
    for (const key in assetSources) {
        const img = new Image();
        img.src = assetSources[key];
        
        // Removed: img.crossOrigin = "anonymous"; 
        // This line caused CORS errors because the server hosting the images
        // does not send the required Access-Control-Allow-Origin header.
        // For simple drawing (not reading pixel data), it's not strictly needed.

        assets[key] = img; // Store the image object

        promises.push(new Promise((resolve) => {
            img.onload = () => {
                console.log(`SUCCESS: Loaded asset '${key}': ${assetSources[key]} - Dimensions: ${img.naturalWidth}x${img.naturalHeight}`);
                resolve(); 
            };
            img.onerror = (e) => {
                console.error(`ERROR: Failed to load asset '${key}' from ${assetSources[key]}`, e);
                // Resolve even on error so Promise.all can complete.
                // The game will use fallbacks for failed assets.
                resolve(); 
            };
            // Immediate check for cached images (important as onload might not fire for cached images)
            if (img.complete && img.naturalWidth > 0) { // Check naturalWidth > 0 to ensure it's a valid image
                console.log(`CACHED SUCCESS: Loaded asset '${key}': ${assetSources[key]} - Dimensions: ${img.naturalWidth}x${img.naturalHeight}`);
                resolve(); // Resolve immediately if complete (from cache)
            } else if (img.complete && img.naturalWidth === 0) {
                // Image is complete but has no natural dimensions, likely an error or empty image
                console.warn(`CACHED WARNING: Asset '${key}' from ${assetSources[key]} is complete but has 0 dimensions.`);
                resolve();
            }
        }));
    }
    return Promise.all(promises);
}

// Bird properties
const bird = {
    x: 50,
    y: 0, // Will be initialized correctly in resetGame based on ground height
    radius: 15, // Radius for collision detection (used if no bird image)
    velocity: 0,
    width: 40, // Rendered width for the raven image
    height: 30, // Rendered height for the raven image
    currentFrame: 'raven', // To track which raven image to draw ('raven' or 'ravenFlap')
};

// Game physics constants
const GRAVITY = 0.15;
const FLAP_STRENGTH = -5;

// Pipe properties
const PIPE_WIDTH = 50;
const PIPE_GAP = 160;
const PIPE_SPEED = 1.0;
const PIPE_INTERVAL = 3000;
let pipes = [];
let lastPipeTime = 0;

// Ground properties (height will be fixed now)
const GROUND_HEIGHT = 50; // Fixed height for the ground strip to prevent stretching
const ground = {
    x: 0,
    height: GROUND_HEIGHT, // Always use the fixed height
    speed: PIPE_SPEED,
};

// --- Game Functions ---

// Draw the bird (now drawing raven images)
function drawBird() {
    const currentBirdImage = assets[bird.currentFrame];
    if (currentBirdImage && currentBirdImage.complete && currentBirdImage.naturalWidth > 0) {
        // Draw the raven image centered around its (x,y) coordinates
        ctx.drawImage(currentBirdImage, bird.x - bird.width / 2, bird.y - bird.height / 2, bird.width, bird.height);
    } else {
        // Fallback to drawing a circle if raven image is not loaded
        ctx.beginPath();
        ctx.arc(bird.x, bird.y, bird.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#FFD700'; // Gold color for fallback
        ctx.fill();
        ctx.strokeStyle = '#DAA520';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.closePath();
    }
}

// Draw a single pipe using images
function drawPipe(pipe) {
    // Draw top pipe image
    if (assets.pipeTop && assets.pipeTop.complete && assets.pipeTop.naturalWidth > 0) {
        ctx.drawImage(assets.pipeTop, pipe.x, 0, PIPE_WIDTH, pipe.y);
    } else {
        // Fallback to drawing colored rectangle
        ctx.fillStyle = '#6B8E23';
        ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.y);
    }

    // Draw bottom pipe image, calculating its height to stop exactly at the ground level
    if (assets.pipeBottom && assets.pipeBottom.complete && assets.pipeBottom.naturalWidth > 0) {
        const bottomPipeY = pipe.y + PIPE_GAP;
        // Corrected calculation: height from bottomPipeY down to the top of the ground
        const bottomPipeHeight = (canvas.height - ground.height) - bottomPipeY;
        if (bottomPipeHeight > 0) { // Only draw if height is positive
             ctx.drawImage(assets.pipeBottom, pipe.x, bottomPipeY, PIPE_WIDTH, bottomPipeHeight);
        }
    } else {
        // Fallback to drawing colored rectangle
        ctx.fillStyle = '#6B8E23';
        // Corrected fallback calculation as well
        ctx.fillRect(pipe.x, pipe.y + PIPE_GAP, PIPE_WIDTH, (canvas.height - ground.height) - (pipe.y + PIPE_GAP));
    }

    // Draw outlines (optional, only for fallbacks if images don't load)
    ctx.strokeStyle = '#556B2F';
    ctx.lineWidth = 2;
    if (!assets.pipeTop || !assets.pipeTop.complete || assets.pipeTop.naturalWidth === 0) {
        ctx.strokeRect(pipe.x, 0, PIPE_WIDTH, pipe.y);
    }
    if (!assets.pipeBottom || !assets.pipeBottom.complete || assets.pipeBottom.naturalWidth === 0) {
        ctx.strokeRect(pipe.x, pipe.y + PIPE_GAP, PIPE_WIDTH, (canvas.height - ground.height) - (pipe.y + PIPE_GAP));
    }
}

// Draw all pipes
function drawPipes() {
    for (let i = 0; i < pipes.length; i++) {
        drawPipe(pipes[i]);
    }
}

// Draw the scrolling ground
function drawGround() {
    // Ground height is now fixed by GROUND_HEIGHT constant
    ground.height = GROUND_HEIGHT; 

    if (assets.ground && assets.ground.complete && assets.ground.naturalWidth > 0) {
        const groundY = canvas.height - ground.height;
        
        // Draw ground multiple times to cover the width and ensure seamless looping
        let currentDrawX = ground.x;
        while (currentDrawX < canvas.width) {
            ctx.drawImage(assets.ground, currentDrawX, groundY, assets.ground.naturalWidth, ground.height);
            currentDrawX += assets.ground.naturalWidth;
        }
        if (ground.x > -assets.ground.naturalWidth) {
            ctx.drawImage(assets.ground, ground.x - assets.ground.naturalWidth, groundY, assets.ground.naturalWidth, ground.height);
        }

    } else {
        // Fallback to drawing a solid ground
        ctx.fillStyle = '#D2B48C'; // Brown color for ground
        ctx.fillRect(0, canvas.height - ground.height, canvas.width, ground.height);
    }
}

// Generate a new pipe, ensuring it respects the ground height
function generatePipe() {
    // Ground height is now fixed by GROUND_HEIGHT constant
    ground.height = GROUND_HEIGHT;
    
    const minTopPipeHeight = 50;
    // The maximum height for the top pipe, adjusted for pipe gap and ground height
    const maxTopPipeHeight = canvas.height - PIPE_GAP - ground.height - 50; 

    // Clamp maxTopPipeHeight to prevent it from being less than minTopPipeHeight
    const actualMaxTopPipeHeight = Math.max(minTopPipeHeight, maxTopPipeHeight);
    
    const topPipeHeight = Math.floor(Math.random() * (actualMaxTopPipeHeight - minTopPipeHeight + 1)) + minTopPipeHeight;

    pipes.push({
        x: canvas.width,
        y: topPipeHeight,
        width: PIPE_WIDTH,
        gap: PIPE_GAP,
        passed: false,
    });
}

// Update game state (bird movement, pipe movement, collisions, scoring)
function updateGame(currentTime) {
    if (!gameRunning || gameOver) return;

    // Update bird velocity and position
    bird.velocity += GRAVITY;
    bird.y += bird.velocity;

    // Ground movement and looping
    ground.x -= ground.speed;
    if (assets.ground && assets.ground.naturalWidth > 0) {
        ground.x = (ground.x % assets.ground.naturalWidth + assets.ground.naturalWidth) % assets.ground.naturalWidth;
    } else {
        ground.x = 0; // If ground image not loaded, don't move ground
    }


    // Collision with top of canvas
    if (bird.y - bird.radius < 0) {
        bird.y = bird.radius;
        bird.velocity = 0;
    }
    // Collision with ground
    // Use ground.height for collision (which is now fixed)
    if (bird.y + bird.radius > canvas.height - ground.height) {
        endGame();
        return;
    }

    // Generate new pipes
    if (currentTime - lastPipeTime > PIPE_INTERVAL) {
        generatePipe();
        lastPipeTime = currentTime;
    }

    // Update pipes and check collisions
    for (let i = 0; i < pipes.length; i++) {
        let pipe = pipes[i];
        pipe.x -= PIPE_SPEED;

        // Check for collision with pipes (using bird's circular shape and pipe's rectangular area)
        if (
            bird.x + bird.radius > pipe.x && // Bird's right side past pipe's left side
            bird.x - bird.radius < pipe.x + pipe.width && // Bird's left side past pipe's right side
            (bird.y - bird.radius < pipe.y || // Bird's top side past top pipe's bottom
                bird.y + bird.radius > pipe.y + pipe.gap) // Bird's bottom side past bottom pipe's top
        ) {
            endGame();
            return;
        }

        // Check if bird has passed pipe for scoring
        if (pipe.x + pipe.width < bird.x && !pipe.passed) {
            score++;
            scoreDisplay.textContent = `Score: ${score}`;
            pipe.passed = true;
        }
    }

    // Remove off-screen pipes
    pipes = pipes.filter(pipe => pipe.x + PIPE_WIDTH > 0);
}

// Clear canvas and redraw all elements in correct order
function draw() {
    // Draw background image first
    if (assets.background && assets.background.complete && assets.background.naturalWidth > 0) {
        ctx.drawImage(assets.background, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Fallback to clearing with default background color
    }

    drawPipes(); // Pipes over background
    drawGround(); // Ground over pipes (to create illusion of pipes emerging from ground)
    drawBird(); // Bird over everything
}

// Main game loop
let animationFrameId;
function gameLoop(currentTime) {
    updateGame(currentTime);
    draw();
    if (!gameOver) {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

// Flap action, includes raven animation
function flap() {
    if (gameRunning && !gameOver) {
        bird.velocity = FLAP_STRENGTH;
        bird.currentFrame = 'ravenFlap'; // Switch to flapping raven image
        // After a short delay, switch back to the normal raven image
        setTimeout(() => {
            bird.currentFrame = 'raven';
        }, 100); // 100ms delay for flap animation
    } else if (gameOver) {
        // If game is over, clicking or spacebar acts as restart
        resetGame();
    }
}

// Reset game state
function resetGame() {
    // Ground height is now fixed by GROUND_HEIGHT constant
    ground.height = GROUND_HEIGHT; 

    bird.velocity = 0;
    pipes = [];
    score = 0;
    scoreDisplay.textContent = `Score: ${score}`;
    gameOver = false;
    gameRunning = false;
    bird.currentFrame = 'raven'; // Ensure bird starts with normal raven image
    ground.x = 0; // Reset ground position for new game

    startScreen.style.display = 'flex';
    gameOverScreen.style.display = 'none';
    cancelAnimationFrame(animationFrameId); // Stop any ongoing animation frame

    // Re-enable start button only after assets are loaded
    startButton.disabled = true;
    loadingText.style.display = 'block';
    
    loadAssets().then(() => {
        // After assets are loaded, ground height is already fixed by GROUND_HEIGHT
        // Now that ground.height is determined, set bird's initial Y
        bird.y = canvas.height / 2 - ground.height / 2;

        startButton.disabled = false;
        loadingText.style.display = 'none';
        draw(); // Perform an initial draw with all assets loaded
    }).catch(error => {
        console.error("Error during asset loading (Promise.all caught):", error);
        loadingText.textContent = "Error loading assets. Check console for details.";
        startButton.disabled = false; // Allow user to start even with errors
        // Ensure a default ground height if loading failed to prevent NaN or undefined
        if (ground.height === 0) ground.height = GROUND_HEIGHT; // Use GROUND_HEIGHT as fallback
        bird.y = canvas.height / 2 - ground.height / 2;
        draw(); // Draw with fallbacks if assets failed
    });
}

// End game state
function endGame() {
    gameOver = true;
    gameRunning = false;
    finalScoreDisplay.textContent = `Your Score: ${score}`;
    gameOverScreen.style.display = 'flex';
    cancelAnimationFrame(animationFrameId); // Stop the animation loop
}

// --- Event Listeners ---
startButton.addEventListener('click', () => {
    if (!startButton.disabled) { // Only start if assets are loaded
        startScreen.style.display = 'none';
        gameOverScreen.style.display = 'none';
        gameRunning = true;
        lastPipeTime = performance.now(); // Initialize last pipe time
        animationFrameId = requestAnimationFrame(gameLoop);
    }
});

restartButton.addEventListener('click', () => {
    // Calling resetGame handles re-loading assets, setting up UI, and starting new game
    resetGame();
});

canvas.addEventListener('click', flap);
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault(); // Prevent scrolling when spacebar is pressed
        flap();
    }
});

// Initial setup - load assets first, then enable start button
resetGame();
