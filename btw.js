(() => {
    function readStoredNumber(storageKey, defaultValue = 0) {
        try {
            let storedString = window.localStorage.getItem(storageKey);
            if (storedString === null) return defaultValue;
            let parsedNumber = Number(storedString);
            return Number.isFinite(parsedNumber) ? parsedNumber : defaultValue;
        } catch {
            return defaultValue;
        }
    }

    function storeNumber(storageKey, value) {
        try {
            return window.localStorage.setItem(storageKey, String(value)), !0;
        } catch {
            return !1;
        }
    }

    function createHighScore(gameId) {
        let storageKey = `wh-games.${gameId}.best`,
            bestScore = readStoredNumber(storageKey, 0);
        return {
            key: storageKey,
            value() {
                return bestScore;
            },
            submit(newScore) {
                return !Number.isFinite(newScore) || newScore <= bestScore ? !1 : ((bestScore = newScore), storeNumber(storageKey, bestScore), !0);
            },
        };
    }

    function createGestureTracker() {
        let activeTouchId = null,
            lastPosition = null,
            startPosition = null,
            startTime = 0,
            hasMoved = !1;
        return {
            start(touch) {
                return activeTouchId !== null
                    ? !1
                    : ((activeTouchId = touch.id), (startPosition = { x: touch.x, y: touch.y }), (lastPosition = { x: touch.x, y: touch.y }), (startTime = touch.at), (hasMoved = !1), !0);
            },
            tracking(touchId) {
                return activeTouchId !== null && touchId === activeTouchId;
            },
            move(touch, cellSize) {
                if (activeTouchId === null || touch.id !== activeTouchId || !(cellSize > 0)) return [];
                Math.hypot(touch.x - startPosition.x, touch.y - startPosition.y) > 10 && (hasMoved = !0);
                let actions = [],
                    horizontalSteps = Math.trunc((touch.x - lastPosition.x) / cellSize);
                if (horizontalSteps !== 0) {
                    for (let stepIndex = 0; stepIndex < Math.abs(horizontalSteps); stepIndex++) actions.push(horizontalSteps > 0 ? "right" : "left");
                    lastPosition.x += horizontalSteps * cellSize;
                }
                let verticalSteps = Math.trunc((touch.y - lastPosition.y) / cellSize);
                if (verticalSteps !== 0) {
                    for (let stepIndex = 0; stepIndex < verticalSteps; stepIndex++) actions.push("soft");
                    lastPosition.y += verticalSteps * cellSize;
                }
                return actions;
            },
            end(touch, cellSize) {
                if (activeTouchId === null || touch.id !== activeTouchId) return null;
                activeTouchId = null;
                let elapsedMs = touch.at - startTime,
                    deltaX = touch.x - startPosition.x,
                    deltaY = touch.y - startPosition.y;
                return hasMoved
                    ? elapsedMs < 250 && deltaY > 2.5 * cellSize && deltaY > Math.abs(deltaX)
                        ? { action: "slam", x: touch.x, y: touch.y }
                        : null
                    : elapsedMs < 250
                      ? { action: "tap", x: touch.x, y: touch.y }
                      : null;
            },
            cancel(touchId) {
                activeTouchId !== null && touchId === activeTouchId && (activeTouchId = null);
            },
        
        };
    }
    function mapTapToAction(tapX, tapY, gamePhase, layout) {
        return gamePhase === "title" || gamePhase === "gameover"
            ? "start"
            : gamePhase === "paused"
              ? "resume"
              : gamePhase !== "playing"
                ? "none"
                : tapY < layout.hudHeight
                  ? tapX > layout.width - layout.muteWidth
                      ? "mute"
                      : "pause"
                  : "rotate";
    }

    document.fonts.load('56px "Press Start 2P"');
    document.fonts.load('16px "VT323"');
    (function () {
        "use strict";
        let canvas = document.getElementById("game"),
            ctx = canvas.getContext("2d"),
            canvasWidth = canvas.width,
            canvasHeight = canvas.height,
            gridCols = 10,
            gridRows = 18,
            cellSize = 28,
            gridLeft = 80,
            groundY = canvasHeight - 60,
            gridTop = groundY - gridRows * cellSize,
            gridRightEdge = gridLeft + gridCols * cellSize,
            pieceColors = { I: "#06ffa5", O: "#ffbe0b", T: "#ff006e", L: "#fb5607", J: "#8338ec", S: "#3a86ff", Z: "#ff4444" },
            pieceShapes = {
                I: [[1, 1, 1, 1]],
                O: [
                    [1, 1],
                    [1, 1],
                ],
                T: [
                    [0, 1, 0],
                    [1, 1, 1],
                ],
                L: [
                    [0, 0, 1],
                    [1, 1, 1],
                ],
                J: [
                    [1, 0, 0],
                    [1, 1, 1],
                ],
                S: [
                    [0, 1, 1],
                    [1, 1, 0],
                ],
                Z: [
                    [1, 1, 0],
                    [0, 1, 1],
                ],
            },
            pieceTypeKeys = Object.keys(pieceShapes),
            gamePhase = "title",
            board,
            currentPiece,
            nextPiece,
            score,
            lives,
            level,
            gravityTimer,
            gravityInterval,
            enemies,
            enemySpawnCountdown,
            enemySpawnInterval,
            levelProgressTimer,
            particles,
            screenShakeAmount,
            screenShakeRemaining,
            breachFlashRemaining,
            scorePopupRemaining,
            isMuted = !1,
            useTouchControls =
                typeof window.matchMedia == "function" &&
                window.matchMedia("(hover: none) and (pointer: coarse)").matches,
            highScore = createHighScore("build-the-wall");
        function resetGame() {
            (board = Array.from({ length: gridRows }, () => Array(gridCols).fill(null))),
                (score = 0),
                (lives = 3),
                (level = 1),
                (gravityTimer = 0),
                (gravityInterval = 850),
                (enemies = []),
                (enemySpawnCountdown = 4e3),
                (enemySpawnInterval = 4500),
                (levelProgressTimer = 0),
                (particles = []),
                (screenShakeAmount = 0),
                (screenShakeRemaining = 0),
                (breachFlashRemaining = 0),
                (scorePopupRemaining = 0),
                (currentPiece = spawnRandomPiece()),
                (nextPiece = spawnRandomPiece());
        }

        function spawnRandomPiece() {
            let pieceType = pieceTypeKeys[Math.floor(Math.random() * pieceTypeKeys.length)],
                shape = pieceShapes[pieceType].map((row) => [...row]);
            return { type: pieceType, shape: shape, color: pieceColors[pieceType], x: Math.floor((gridCols - shape[0].length) / 2), y: 0 };
        }

        function rotateShapeMatrix(matrix) {
            let rowCount = matrix.length,
                colCount = matrix[0].length,
                rotated = Array.from({ length: colCount }, () => Array(rowCount).fill(0));
            for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) for (let colIndex = 0; colIndex < colCount; colIndex++) rotated[colIndex][rowCount - 1 - rowIndex] = matrix[rowIndex][colIndex];
            return rotated;
        }

        function collides(piece, offsetX, offsetY, shapeMatrix) {
            shapeMatrix = shapeMatrix || piece.shape;
            for (let rowIndex = 0; rowIndex < shapeMatrix.length; rowIndex++)
                for (let colIndex = 0; colIndex < shapeMatrix[rowIndex].length; colIndex++) {
                    if (!shapeMatrix[rowIndex][colIndex]) continue;
                    let boardCol = piece.x + colIndex + offsetX,
                        boardRow = piece.y + rowIndex + offsetY;
                    if (boardCol < 0 || boardCol >= gridCols || boardRow >= gridRows || (boardRow >= 0 && board[boardRow][boardCol])) return !0;
                }
            return !1;
        }

        function lockPiece(piece) {
            let topLockedRow = gridRows;
            for (let rowIndex = 0; rowIndex < piece.shape.length; rowIndex++)
                for (let colIndex = 0; colIndex < piece.shape[rowIndex].length; colIndex++) {
                    if (!piece.shape[rowIndex][colIndex]) continue;
                    let boardCol = piece.x + colIndex,
                        boardRow = piece.y + rowIndex;
                    boardRow >= 0 &&
                        boardRow < gridRows &&
                        boardCol >= 0 &&
                        boardCol < gridCols &&
                        ((board[boardRow][boardCol] = piece.color), spawnBrickParticles(gridLeft + boardCol * cellSize + cellSize / 2, gridTop + boardRow * cellSize + cellSize / 2), boardRow < topLockedRow && (topLockedRow = boardRow));
                }
            (score += 10), setShake(2.5, 90), playSound(140, 0.08, "square", 0.07), (currentPiece = nextPiece), (nextPiece = spawnRandomPiece()), collides(currentPiece, 0, 0) && gameOver();
        }

        function hardDrop() {
            let dropDistance = 0;
            for (; !collides(currentPiece, 0, 1); ) currentPiece.y++, dropDistance++;
            (score += dropDistance * 2), playSound(90, 0.12, "sawtooth", 0.09), lockPiece(currentPiece);
        }

        function rotateCurrentPiece() {
            let rotatedShape = rotateShapeMatrix(currentPiece.shape),
                wallKickOffsets = [0, -1, 1, -2, 2];
            for (let offset of wallKickOffsets)
                if (!collides(currentPiece, offset, 0, rotatedShape)) {
                    (currentPiece.shape = rotatedShape), (currentPiece.x += offset), playSound(420, 0.04, "square", 0.05);
                    return;
                }
        }

        function getColumnHeight(columnIndex) {
            for (let rowIndex = 0; rowIndex < gridRows; rowIndex++) if (board[rowIndex][columnIndex]) return gridRows - rowIndex;
            return 0;
        }

        let enemyTypes = [
            { name: "crawler", strength: 1, speed: 0.055, weight: 50, color: "#06ffa5" },
            { name: "walker", strength: 2, speed: 0.075, weight: 35, color: "#a8ff06" },
            { name: "lurcher", strength: 4, speed: 0.045, weight: 15, color: "#ff9c06" },
        ];

        function pickEnemyType() {
            let totalWeight = enemyTypes.reduce((sum, enemyType) => sum + enemyType.weight, 0),
                roll = Math.random() * totalWeight;
            for (let enemyType of enemyTypes) if (((roll -= enemyType.weight), roll <= 0)) return enemyType;
            return enemyTypes[0];
        }

        function spawnEnemy() {
            let enemyType = pickEnemyType();
            enemies.push({
                type: enemyType,
                x: canvasWidth + 30 + Math.random() * 60,
                y: groundY + 2,
                vx: -enemyType.speed * (1 + level * 0.06),
                state: "walking",
                anim: Math.random() * 1e3,
                lastCheckedCol: gridCols,
                strengthCheck: enemyType.strength,
                deathTime: 0,
                shamble: Math.random() * Math.PI * 2,
            });
        }

        function updateEnemies(deltaMs) {
            for (let enemy of enemies)
                if (enemy.state === "walking") {
                    (enemy.x += enemy.vx * deltaMs), (enemy.anim += deltaMs), (enemy.shamble += deltaMs * 0.008);
                    let columnIndex = Math.floor((enemy.x - gridLeft) / cellSize);
                    columnIndex < enemy.lastCheckedCol &&
                        (columnIndex < 0
                            ? ((enemy.state = "breached"), (enemy.lastCheckedCol = -1), loseLife())
                            : columnIndex < gridCols &&
                              (getColumnHeight(columnIndex) >= enemy.strengthCheck &&
                                  ((enemy.state = "dead"),
                                  (enemy.deathTime = 0),
                                  (enemy.x = gridLeft + (columnIndex + 1) * cellSize),
                                  (score += 50 * enemy.strengthCheck),
                                  spawnEnemyParticles(enemy.x, enemy.y - 14, enemy.type.color),
                                  setShake(3.5, 120),
                                  playSound(280, 0.12, "sawtooth", 0.09),
                                  playSound(140, 0.18, "sawtooth", 0.07),
                                  (scorePopupRemaining = 600)),
                              (enemy.lastCheckedCol = columnIndex)));
                } else enemy.state === "dead" && (enemy.deathTime += deltaMs);
            enemies = enemies.filter((enemy) => !(enemy.state === "breached" || (enemy.state === "dead" && enemy.deathTime > 700)));
        }

        function gameOver() {
            (gamePhase = "gameover"), highScore.submit(score), setShake(10, 600), playSound(120, 0.4, "sawtooth", 0.12), playSound(80, 0.6, "sawtooth", 0.1);
        }

        function loseLife() {
            lives--, setShake(10, 500), (breachFlashRemaining = 400), playSound(70, 0.5, "sawtooth", 0.14), lives <= 0 && gameOver();
        }

        function spawnBrickParticles(centerX, centerY) {
            for (let particleIndex = 0; particleIndex < 5; particleIndex++)
                particles.push({
                    x: centerX,
                    y: centerY,
                    vx: (Math.random() - 0.5) * 0.15,
                    vy: -Math.random() * 0.1 - 0.02,
                    life: 400 + Math.random() * 200,
                    maxLife: 600,
                    color: "#d4a574",
                    size: 2 + Math.random() * 2,
                    gravity: 3e-4,
                });
        }

        function spawnEnemyParticles(centerX, centerY, baseColor) {
            for (let particleIndex = 0; particleIndex < 14; particleIndex++)
                particles.push({
                    x: centerX,
                    y: centerY,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: -Math.random() * 0.35 - 0.1,
                    life: 600 + Math.random() * 500,
                    maxLife: 1100,
                    color: particleIndex % 3 === 0 ? "#ff006e" : baseColor,
                    size: 2 + Math.random() * 3,
                    gravity: 0.001,
                });
        }

        function updateParticles(deltaMs) {
            for (let particle of particles) (particle.x += particle.vx * deltaMs), (particle.y += particle.vy * deltaMs), particle.gravity && (particle.vy += particle.gravity * deltaMs), (particle.life -= deltaMs);
            particles = particles.filter((particle) => particle.life > 0);
        }

        function setShake(intensity, durationMs) {
            (screenShakeAmount = Math.max(screenShakeAmount, intensity)), (screenShakeRemaining = Math.max(screenShakeRemaining, durationMs));
        }

        let audioContext = null;
        function ensureAudio() {
            if (!audioContext)
                try {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                } catch {}
        }

        function playSound(frequency, duration, waveType = "square", volume = 0.08) {
            if (!(isMuted || !audioContext))
                try {
                    let oscillator = audioContext.createOscillator(),
                        gainNode = audioContext.createGain();
                    (oscillator.type = waveType),
                        (oscillator.frequency.value = frequency),
                        (gainNode.gain.value = volume),
                        gainNode.gain.exponentialRampToValueAtTime(1e-4, audioContext.currentTime + duration),
                        oscillator.connect(gainNode),
                        gainNode.connect(audioContext.destination),
                        oscillator.start(),
                        oscillator.stop(audioContext.currentTime + duration + 0.02);
                } catch {}
        }

        let stars = Array.from({ length: 70 }, () => ({
                x: Math.random() * canvasWidth,
                y: Math.random() * (groundY - 100),
                brightness: Math.random(),
                speed: 0.3 + Math.random() * 0.8,
                size: Math.random() < 0.15 ? 2 : 1,
            })),
            hills = [];
        {
            let hillX = 0;
            for (; hillX < canvasWidth + 20; ) {
                let hillWidth = 80 + Math.random() * 120,
                    hillHeight = 30 + Math.random() * 60;
                hills.push({ x: hillX, w: hillWidth, h: hillHeight }), (hillX += hillWidth * 0.6);
            }
        }

        function drawBackground(timestamp) {
            let skyGradient = ctx.createLinearGradient(0, 0, 0, groundY);
            skyGradient.addColorStop(0, "#070218"),
                skyGradient.addColorStop(0.35, "#240744"),
                skyGradient.addColorStop(0.65, "#6b0a5e"),
                skyGradient.addColorStop(0.88, "#ff2a6d"),
                skyGradient.addColorStop(1, "#ffae42"),
                (ctx.fillStyle = skyGradient),
                ctx.fillRect(0, 0, canvasWidth, groundY);
            for (let star of stars) {
                let twinkle = 0.5 + 0.5 * Math.sin(timestamp * 0.003 * star.speed + star.brightness * 10);
                (ctx.fillStyle = `rgba(255, 240, 255, ${0.25 + twinkle * 0.7})`), ctx.fillRect(star.x, star.y, star.size, star.size);
            }
            let sunCenterX = canvasWidth * 0.74,
                sunCenterY = groundY - 90,
                sunRadius = 85,
                sunGlowGradient = ctx.createRadialGradient(sunCenterX, sunCenterY, 0, sunCenterX, sunCenterY, sunRadius * 2.3);
            sunGlowGradient.addColorStop(0, "rgba(255, 130, 0, 0.5)"),
                sunGlowGradient.addColorStop(0.35, "rgba(255, 0, 110, 0.22)"),
                sunGlowGradient.addColorStop(1, "rgba(255, 0, 110, 0)"),
                (ctx.fillStyle = sunGlowGradient),
                ctx.fillRect(sunCenterX - sunRadius * 2.3, sunCenterY - sunRadius * 2.3, sunRadius * 4.6, sunRadius * 2.3),
                ctx.save(),
                ctx.beginPath(),
                ctx.arc(sunCenterX, sunCenterY, sunRadius, 0, Math.PI * 2),
                ctx.clip();
            let sunFillGradient = ctx.createLinearGradient(sunCenterX, sunCenterY - sunRadius, sunCenterX, sunCenterY + sunRadius);
            sunFillGradient.addColorStop(0, "#ffd60a"),
                sunFillGradient.addColorStop(0.45, "#fb5607"),
                sunFillGradient.addColorStop(1, "#ff006e"),
                (ctx.fillStyle = sunFillGradient),
                ctx.fillRect(sunCenterX - sunRadius, sunCenterY - sunRadius, sunRadius * 2, sunRadius * 2),
                (ctx.fillStyle = "rgba(10, 4, 32, 0.85)");
            let sunCraterOffsets = [42, 56, 71, 87, 105, 125];
            for (let craterOffset of sunCraterOffsets) ctx.fillRect(sunCenterX - sunRadius, sunCenterY - sunRadius + craterOffset, sunRadius * 2, 3);
            ctx.restore(), (ctx.fillStyle = "#1a0628"), ctx.beginPath(), ctx.moveTo(0, groundY);
            for (let hill of hills)
                ctx.lineTo(hill.x, groundY - hill.h), ctx.lineTo(hill.x + hill.w * 0.5, groundY - hill.h * 1.4), ctx.lineTo(hill.x + hill.w, groundY - hill.h * 0.7);
            ctx.lineTo(canvasWidth, groundY),
                ctx.closePath(),
                ctx.fill(),
                (ctx.fillStyle = "#0a0218"),
                ctx.beginPath(),
                ctx.moveTo(0, groundY),
                ctx.lineTo(0, groundY - 22),
                ctx.bezierCurveTo(200, groundY - 38, 380, groundY - 18, 560, groundY - 32),
                ctx.bezierCurveTo(700, groundY - 42, 820, groundY - 20, canvasWidth, groundY - 30),
                ctx.lineTo(canvasWidth, groundY),
                ctx.closePath(),
                ctx.fill(),
                drawTower(440, groundY - 4, 1),
                drawTower(630, groundY - 6, 1.4),
                drawTower(800, groundY - 2, 0.85);
            let groundGradient = ctx.createLinearGradient(0, groundY, 0, canvasHeight);
            groundGradient.addColorStop(0, "#3a0a4a"),
                groundGradient.addColorStop(1, "#06000f"),
                (ctx.fillStyle = groundGradient),
                ctx.fillRect(0, groundY, canvasWidth, canvasHeight - groundY),
                (ctx.strokeStyle = "rgba(255, 0, 110, 0.6)"),
                (ctx.lineWidth = 1.2);
            let groundTop = groundY,
                groundBandHeight = canvasHeight - groundY,
                scanlineOffset = (timestamp * 0.04) % 14;
            for (let scanlineIndex = 0; scanlineIndex < 8; scanlineIndex++) {
                let scanlineProgress = (scanlineIndex * 14 + scanlineOffset) / 112,
                    scanlineY = groundTop + groundBandHeight * (scanlineProgress * scanlineProgress);
                (ctx.globalAlpha = 1 - scanlineProgress * 0.4), ctx.beginPath(), ctx.moveTo(0, scanlineY), ctx.lineTo(canvasWidth, scanlineY), ctx.stroke();
            }
            ctx.globalAlpha = 1;
            let vanishPointX = canvasWidth * 0.55;
            ctx.strokeStyle = "rgba(255, 0, 110, 0.45)";
            for (let perspectiveLineIndex = -10; perspectiveLineIndex <= 10; perspectiveLineIndex++) {
                let lineEndX = vanishPointX + perspectiveLineIndex * 90;
                ctx.beginPath(), ctx.moveTo(vanishPointX, groundTop), ctx.lineTo(lineEndX, canvasHeight), ctx.stroke();
            }
        }

        function drawTower(x, baseY, scale) {
            let resolvedScale = scale || 1;
            ctx.fillStyle = "#08151a";
            let towerWidth = 8 * resolvedScale,
                towerHeight = 50 * resolvedScale;
            ctx.fillRect(x - towerWidth / 2, baseY - towerHeight, towerWidth, towerHeight),
                ctx.fillRect(x - 14 * resolvedScale, baseY - 35 * resolvedScale, 8 * resolvedScale, 5 * resolvedScale),
                ctx.fillRect(x - 14 * resolvedScale, baseY - 42 * resolvedScale, 5 * resolvedScale, 12 * resolvedScale),
                ctx.fillRect(x + 6 * resolvedScale, baseY - 40 * resolvedScale, 10 * resolvedScale, 5 * resolvedScale),
                ctx.fillRect(x + 11 * resolvedScale, baseY - 48 * resolvedScale, 5 * resolvedScale, 13 * resolvedScale),
                (ctx.fillStyle = "rgba(255, 0, 110, 0.25)"),
                ctx.fillRect(x - towerWidth / 2 - 1, baseY - towerHeight, 1, towerHeight);
        }
        function drawBrick(x, y, color) {
            (ctx.fillStyle = color),
                ctx.fillRect(x, y, cellSize, cellSize),
                (ctx.fillStyle = "rgba(255, 255, 255, 0.35)"),
                ctx.fillRect(x + 1, y + 1, cellSize - 2, 2),
                ctx.fillRect(x + 1, y + 1, 2, cellSize - 2),
                (ctx.fillStyle = "rgba(0, 0, 0, 0.45)"),
                ctx.fillRect(x + 1, y + cellSize - 3, cellSize - 2, 2),
                ctx.fillRect(x + cellSize - 3, y + 1, 2, cellSize - 2),
                (ctx.fillStyle = "rgba(0, 0, 0, 0.55)"),
                ctx.fillRect(x, y, cellSize, 1),
                ctx.fillRect(x, y, 1, cellSize),
                ctx.fillRect(x, y + cellSize - 1, cellSize, 1),
                ctx.fillRect(x + cellSize - 1, y, 1, cellSize);
        }

        function drawGrid() {
            (ctx.fillStyle = "rgba(0, 0, 0, 0.35)"),
                ctx.fillRect(gridLeft, gridTop, gridCols * cellSize, gridRows * cellSize),
                (ctx.strokeStyle = "rgba(255, 255, 255, 0.04)"),
                (ctx.lineWidth = 1);
            for (let colIndex = 1; colIndex < gridCols; colIndex++)
                ctx.beginPath(), ctx.moveTo(gridLeft + colIndex * cellSize + 0.5, gridTop), ctx.lineTo(gridLeft + colIndex * cellSize + 0.5, gridTop + gridRows * cellSize), ctx.stroke();
            for (let rowIndex = 1; rowIndex < gridRows; rowIndex++)
                ctx.beginPath(), ctx.moveTo(gridLeft, gridTop + rowIndex * cellSize + 0.5), ctx.lineTo(gridLeft + gridCols * cellSize, gridTop + rowIndex * cellSize + 0.5), ctx.stroke();
        }

        function drawBoardBorder() {
            (ctx.strokeStyle = "#ff006e"),
                (ctx.lineWidth = 2),
                (ctx.shadowColor = "#ff006e"),
                (ctx.shadowBlur = 12),
                ctx.strokeRect(gridLeft - 1, gridTop - 1, gridCols * cellSize + 2, gridRows * cellSize + 2),
                (ctx.shadowBlur = 0);
        }

        function drawLockedBricks() {
            for (let rowIndex = 0; rowIndex < gridRows; rowIndex++) for (let colIndex = 0; colIndex < gridCols; colIndex++) board[rowIndex][colIndex] && drawBrick(gridLeft + colIndex * cellSize, gridTop + rowIndex * cellSize, board[rowIndex][colIndex]);
        }

        function drawGhostPiece() {
            let ghostDropRows = 0;
            for (; !collides(currentPiece, 0, ghostDropRows + 1); ) ghostDropRows++;
            ctx.lineWidth = 1.5;
            for (let rowIndex = 0; rowIndex < currentPiece.shape.length; rowIndex++)
                for (let colIndex = 0; colIndex < currentPiece.shape[rowIndex].length; colIndex++) {
                    if (!currentPiece.shape[rowIndex][colIndex]) continue;
                    let pixelX = gridLeft + (currentPiece.x + colIndex) * cellSize,
                        pixelY = gridTop + (currentPiece.y + rowIndex + ghostDropRows) * cellSize;
                    (ctx.strokeStyle = currentPiece.color), (ctx.globalAlpha = 0.35), ctx.strokeRect(pixelX + 2, pixelY + 2, cellSize - 4, cellSize - 4);
                }
            ctx.globalAlpha = 1;
        }

        function drawActivePiece() {
            (ctx.shadowColor = currentPiece.color), (ctx.shadowBlur = 8);
            for (let rowIndex = 0; rowIndex < currentPiece.shape.length; rowIndex++)
                for (let colIndex = 0; colIndex < currentPiece.shape[rowIndex].length; colIndex++) {
                    if (!currentPiece.shape[rowIndex][colIndex]) continue;
                    let pixelX = gridLeft + (currentPiece.x + colIndex) * cellSize,
                        pixelY = gridTop + (currentPiece.y + rowIndex) * cellSize;
                    pixelY >= gridTop - cellSize && drawBrick(pixelX, pixelY, currentPiece.color);
                }
            ctx.shadowBlur = 0;
        }

        function drawEnemy(enemy, timestamp) {
            let enemyX = enemy.x,
                enemyY = enemy.y,
                enemyType = enemy.type,
                legSwing = enemy.state === "walking" ? Math.sin(enemy.shamble) : 0,
                bodyBob = enemy.state === "walking" ? Math.sin(enemy.shamble * 0.7) * 1.5 : 0;
            if ((ctx.save(), enemy.state === "dead")) {
                let deathProgress = Math.min(1, enemy.deathTime / 700);
                (ctx.globalAlpha = Math.max(0, 1 - deathProgress)), ctx.translate(enemyX, enemyY), ctx.rotate(deathProgress * 0.9), ctx.translate(-enemyX, -enemyY);
            }
            (ctx.shadowColor = enemyType.color),
                (ctx.shadowBlur = 14),
                enemyType.name === "crawler"
                    ? ((ctx.fillStyle = enemyType.color),
                      ctx.fillRect(enemyX - 13, enemyY - 16 + bodyBob, 26, 12),
                      ctx.fillRect(enemyX - 9, enemyY - 22 + bodyBob, 18, 7),
                      ctx.fillRect(enemyX - 18, enemyY - 12 + legSwing * 1.5, 6, 4),
                      ctx.fillRect(enemyX + 12, enemyY - 12 - legSwing * 1.5, 6, 4),
                      (ctx.fillStyle = "#2a1a1a"),
                      ctx.fillRect(enemyX - 10, enemyY - 4, 5, 4),
                      ctx.fillRect(enemyX + 5, enemyY - 4, 5, 4),
                      (ctx.shadowBlur = 0),
                      (ctx.fillStyle = "#ff006e"),
                      ctx.fillRect(enemyX - 6, enemyY - 19 + bodyBob, 3, 3),
                      ctx.fillRect(enemyX + 3, enemyY - 19 + bodyBob, 3, 3),
                      (ctx.fillStyle = "rgba(0, 0, 0, 0.5)"),
                      ctx.fillRect(enemyX - 4, enemyY - 13 + bodyBob, 2, 5),
                      ctx.fillRect(enemyX + 6, enemyY - 13 + bodyBob, 2, 5))
                    : enemyType.name === "walker"
                      ? ((ctx.fillStyle = "#1f1015"),
                        ctx.fillRect(enemyX - 8, enemyY - 12, 6, 12),
                        ctx.fillRect(enemyX + 2, enemyY - 12 - legSwing * 2, 6, 12 + legSwing * 2),
                        (ctx.fillStyle = "#4a2030"),
                        ctx.fillRect(enemyX - 8, enemyY - 22, 6, 10),
                        ctx.fillRect(enemyX + 2, enemyY - 22, 6, 10),
                        (ctx.fillStyle = enemyType.color),
                        ctx.fillRect(enemyX - 11, enemyY - 36 + bodyBob, 22, 16),
                        (ctx.fillStyle = "rgba(0, 0, 0, 0.4)"),
                        ctx.fillRect(enemyX - 4, enemyY - 30 + bodyBob, 8, 8),
                        (ctx.fillStyle = enemyType.color),
                        ctx.fillRect(enemyX - 20, enemyY - 34 + bodyBob + legSwing, 10, 5),
                        ctx.fillRect(enemyX + 10, enemyY - 34 + bodyBob - legSwing, 10, 5),
                        (ctx.fillStyle = "#7aaa3a"),
                        ctx.fillRect(enemyX - 24, enemyY - 36 + bodyBob + legSwing, 5, 8),
                        ctx.fillRect(enemyX + 19, enemyY - 36 + bodyBob - legSwing, 5, 8),
                        (ctx.fillStyle = enemyType.color),
                        ctx.fillRect(enemyX - 8, enemyY - 48 + bodyBob, 16, 12),
                        (ctx.fillStyle = "#1a0a14"),
                        ctx.fillRect(enemyX - 4, enemyY - 39 + bodyBob, 8, 3),
                        (ctx.shadowBlur = 0),
                        (ctx.fillStyle = "#ff006e"),
                        ctx.fillRect(enemyX - 5, enemyY - 44 + bodyBob, 3, 3),
                        ctx.fillRect(enemyX + 2, enemyY - 44 + bodyBob, 3, 3))
                      : enemyType.name === "lurcher" &&
                        ((ctx.fillStyle = "#1f1015"),
                        ctx.fillRect(enemyX - 11, enemyY - 14, 8, 14),
                        ctx.fillRect(enemyX + 3, enemyY - 14 - legSwing * 2, 8, 14 + legSwing * 2),
                        (ctx.fillStyle = enemyType.color),
                        ctx.fillRect(enemyX - 16, enemyY - 46 + bodyBob, 32, 32),
                        (ctx.fillStyle = "rgba(0, 0, 0, 0.5)"),
                        ctx.fillRect(enemyX - 5, enemyY - 38 + bodyBob, 10, 16),
                        ctx.fillRect(enemyX - 14, enemyY - 42 + bodyBob, 4, 6),
                        (ctx.fillStyle = enemyType.color),
                        ctx.fillRect(enemyX - 28, enemyY - 42 + bodyBob + legSwing, 12, 7),
                        ctx.fillRect(enemyX + 16, enemyY - 42 + bodyBob - legSwing, 12, 7),
                        (ctx.fillStyle = "#a86010"),
                        ctx.fillRect(enemyX - 32, enemyY - 44 + bodyBob + legSwing, 6, 11),
                        ctx.fillRect(enemyX + 26, enemyY - 44 + bodyBob - legSwing, 6, 11),
                        (ctx.fillStyle = enemyType.color),
                        ctx.fillRect(enemyX - 11, enemyY - 60 + bodyBob, 22, 14),
                        (ctx.fillStyle = "#fff5d0"),
                        ctx.fillRect(enemyX - 5, enemyY - 48 + bodyBob, 2, 5),
                        ctx.fillRect(enemyX + 3, enemyY - 48 + bodyBob, 2, 5),
                        (ctx.shadowBlur = 0),
                        (ctx.fillStyle = "#ff006e"),
                        ctx.fillRect(enemyX - 7, enemyY - 56 + bodyBob, 4, 4),
                        ctx.fillRect(enemyX + 3, enemyY - 56 + bodyBob, 4, 4)),
                ctx.restore(),
                (ctx.shadowBlur = 0);
        }

        function drawParticles() {
            for (let particle of particles) {
                let alpha = particle.life / particle.maxLife;
                (ctx.globalAlpha = alpha),
                    (ctx.fillStyle = particle.color),
                    ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
            }
            ctx.globalAlpha = 1;
        }

        function drawBorderSign() {
            let signBaseY = groundY - 50;
            (ctx.fillStyle = "#1a0a05"),
                ctx.fillRect(718, signBaseY, 4, 50),
                (ctx.fillStyle = "#1a0420"),
                ctx.fillRect(658, signBaseY - 42, 124, 36),
                (ctx.fillStyle = "#ffbe0b"),
                ctx.fillRect(660, signBaseY - 40, 120, 32),
                (ctx.strokeStyle = "#5a2a00"),
                (ctx.lineWidth = 1.5),
                ctx.strokeRect(660, signBaseY - 40, 120, 32),
                (ctx.font = '8px "Press Start 2P"'),
                (ctx.fillStyle = "#5a2a00"),
                (ctx.textAlign = "center"),
                ctx.fillText("SOUTHERN", 720, signBaseY - 26),
                ctx.fillText("BORDER \u2190", 720, signBaseY - 12),
                (ctx.textAlign = "left"),
                (ctx.shadowColor = "#ffbe0b"),
                (ctx.shadowBlur = 18),
                (ctx.strokeStyle = "rgba(255, 190, 11, 0.3)"),
                (ctx.lineWidth = 1),
                ctx.strokeRect(660, signBaseY - 40, 120, 32),
                (ctx.shadowBlur = 0);
        }
        function drawHud() {
            (ctx.fillStyle = "rgba(0, 0, 0, 0.7)"),
                ctx.fillRect(0, 0, canvasWidth, 52),
                (ctx.shadowColor = "#ff006e"),
                (ctx.shadowBlur = 8),
                (ctx.strokeStyle = "#ff006e"),
                (ctx.lineWidth = 1.5),
                ctx.beginPath(),
                ctx.moveTo(0, 52),
                ctx.lineTo(canvasWidth, 52),
                ctx.stroke(),
                (ctx.shadowBlur = 0),
                (ctx.font = '12px "Press Start 2P"'),
                (ctx.fillStyle = "#ff006e"),
                (ctx.shadowColor = "#ff006e"),
                (ctx.shadowBlur = 10),
                ctx.fillText("BUILD THE WALL", 20, 32),
                (ctx.font = '9px "Press Start 2P"'),
                (ctx.fillStyle = "#ffbe0b"),
                (ctx.shadowColor = "#ffbe0b"),
                (ctx.shadowBlur = 6),
                ctx.fillText("SCORE", 250, 18),
                (ctx.fillStyle = "#fff"),
                (ctx.shadowBlur = 4),
                ctx.fillText(String(score).padStart(6, "0"), 250, 36),
                (ctx.fillStyle = "#06ffa5"),
                (ctx.shadowColor = "#06ffa5"),
                (ctx.shadowBlur = 6),
                ctx.fillText("HI", 380, 18),
                (ctx.fillStyle = "#fff"),
                (ctx.shadowBlur = 4),
                ctx.fillText(String(Math.max(highScore.value(), score)).padStart(6, "0"), 380, 36),
                (ctx.fillStyle = "#8338ec"),
                (ctx.shadowColor = "#8338ec"),
                (ctx.shadowBlur = 6),
                ctx.fillText("LV", 510, 18),
                (ctx.fillStyle = "#fff"),
                (ctx.shadowBlur = 4),
                ctx.fillText(String(level).padStart(2, "0"), 510, 36),
                (ctx.fillStyle = "#ff006e"),
                (ctx.shadowColor = "#ff006e"),
                (ctx.shadowBlur = 6),
                ctx.fillText("LIVES", 580, 18),
                (ctx.shadowBlur = 0);
            for (let lifeIndex = 0; lifeIndex < 3; lifeIndex++) {
                ctx.fillStyle = lifeIndex < lives ? "#ff006e" : "rgba(255, 0, 110, 0.18)";
                let lifeIconX = 580 + lifeIndex * 18;
                ctx.fillRect(lifeIconX, 28, 12, 4),
                    ctx.fillRect(lifeIconX + 2, 26, 8, 2),
                    ctx.fillRect(lifeIconX + 1, 32, 10, 6),
                    ctx.fillRect(lifeIconX + 3, 38, 6, 2);
            }

            (ctx.fillStyle = "#06ffa5"),
                (ctx.shadowColor = "#06ffa5"),
                (ctx.shadowBlur = 6),
                ctx.fillText("NEXT", 710, 18),
                (ctx.shadowBlur = 0);
            let previewLeft = 780,
                previewTop = 14,
                previewCellSize = 11;
            for (let rowIndex = 0; rowIndex < nextPiece.shape.length; rowIndex++)
                for (let colIndex = 0; colIndex < nextPiece.shape[rowIndex].length; colIndex++)
                    nextPiece.shape[rowIndex][colIndex] &&
                        ((ctx.fillStyle = nextPiece.color),
                        ctx.fillRect(previewLeft + colIndex * previewCellSize, previewTop + rowIndex * previewCellSize, previewCellSize - 1, previewCellSize - 1),
                        (ctx.fillStyle = "rgba(255, 255, 255, 0.3)"),
                        ctx.fillRect(previewLeft + colIndex * previewCellSize, previewTop + rowIndex * previewCellSize, previewCellSize - 1, 1));
            (ctx.font = '8px "Press Start 2P"'),
                (ctx.fillStyle = isMuted ? "#ff006e" : "rgba(255, 255, 255, 0.4)"),
                ctx.fillText(isMuted ? "[M]UTED" : "[M]", 870, 12);
        }

        function drawTitleScreen(timestamp) {
            drawBackground(timestamp), drawBorderSign();
            let demoBrickPositions = [
                [0, gridRows - 1],
                [1, gridRows - 1],
                [2, gridRows - 1],
                [3, gridRows - 1],
                [5, gridRows - 1],
                [6, gridRows - 1],
                [0, gridRows - 2],
                [1, gridRows - 2],
                [5, gridRows - 2],
                [6, gridRows - 2],
                [5, gridRows - 3],
            ];
            for (let [colIndex, rowIndex] of demoBrickPositions) drawBrick(gridLeft + colIndex * cellSize, gridTop + rowIndex * cellSize, "#ffbe0b");
            drawEnemy({ x: 540, y: groundY + 2, type: enemyTypes[1], state: "walking", shamble: timestamp * 0.005, anim: timestamp, deathTime: 0 }, timestamp);
            let centerX = canvasWidth / 2,
                titleBob = Math.sin(timestamp * 0.0025) * 4;
            (ctx.textAlign = "center"),
                (ctx.font = '56px "Press Start 2P"'),
                (ctx.shadowColor = "#ff006e"),
                (ctx.shadowBlur = 35),
                (ctx.fillStyle = "#ff006e"),
                ctx.fillText("BUILD", centerX - 3, 175 + titleBob),
                (ctx.shadowColor = "#06ffa5"),
                (ctx.fillStyle = "#06ffa5"),
                ctx.fillText("THE WALL", centerX + 3, 250 + titleBob),
                (ctx.shadowBlur = 12),
                (ctx.font = '14px "Press Start 2P"'),
                (ctx.fillStyle = "#ffbe0b"),
                (ctx.shadowColor = "#ffbe0b"),
                ctx.fillText("\u2605 ZOMBIE BORDER SIEGE \u2605", centerX, 305),
                (ctx.font = '10px "Press Start 2P"'),
                (ctx.fillStyle = "#ffffff"),
                (ctx.shadowColor = "#ffffff"),
                (ctx.shadowBlur = 8),
                ctx.fillText("STACK BRICKS. HOLD THE LINE.", centerX, 345),
                Math.floor(timestamp / 450) % 2 === 0 &&
                    ((ctx.font = '16px "Press Start 2P"'),
                    (ctx.fillStyle = "#fff"),
                    (ctx.shadowColor = "#06ffa5"),
                    (ctx.shadowBlur = 16),
                    ctx.fillText(useTouchControls ? "TAP TO START" : "PRESS SPACE TO START", centerX, 410)),
                (ctx.font = '8px "Press Start 2P"'),
                (ctx.fillStyle = "#8338ec"),
                (ctx.shadowColor = "#8338ec"),
                (ctx.shadowBlur = 6),
                ctx.fillText(
                    useTouchControls
                        ? "DRAG MOVE   TAP ROTATE   FLICK DOWN SLAM"
                        : "\u2190 \u2192 MOVE   \u2191 ROTATE   \u2193 DROP   SPACE SLAM",
                    centerX,
                    455
                ),
                highScore.value() > 0 &&
                    ((ctx.fillStyle = "#ff006e"),
                    (ctx.shadowColor = "#ff006e"),
                    ctx.fillText("HI-SCORE  " + String(highScore.value()).padStart(6, "0"), centerX, 490)),
                (ctx.font = '8px "Press Start 2P"'),
                (ctx.fillStyle = "rgba(255, 255, 255, 0.5)"),
                (ctx.shadowBlur = 0),
                ctx.fillText("\xA9 198X  ARCADE EDITION", centerX, 540),
                (ctx.shadowBlur = 0),
                (ctx.textAlign = "left");
        }
        function drawGameOverScreen(timestamp) {
            (ctx.fillStyle = "rgba(8, 0, 18, 0.78)"), ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            let centerX = canvasWidth / 2;
            (ctx.textAlign = "center"),
                (ctx.font = '52px "Press Start 2P"'),
                (ctx.shadowColor = "#ff006e"),
                (ctx.shadowBlur = 35),
                (ctx.fillStyle = "#ff006e"),
                ctx.fillText("BORDER", centerX - 3, 215),
                ctx.fillText("BREACHED", centerX + 3, 285),
                (ctx.font = '14px "Press Start 2P"'),
                (ctx.shadowBlur = 12),
                (ctx.fillStyle = "#ffbe0b"),
                (ctx.shadowColor = "#ffbe0b"),
                ctx.fillText("SCORE   " + String(score).padStart(6, "0"), centerX, 350),
                (ctx.fillStyle = "#06ffa5"),
                (ctx.shadowColor = "#06ffa5"),
                ctx.fillText("LEVEL   " + String(level).padStart(2, "0"), centerX, 380),
                score >= highScore.value() &&
                    highScore.value() > 0 &&
                    ((ctx.font = '12px "Press Start 2P"'),
                    (ctx.fillStyle = "#ff006e"),
                    (ctx.shadowColor = "#ff006e"),
                    (ctx.shadowBlur = 16),
                    Math.floor(timestamp / 200) % 2 === 0 && ctx.fillText("\u2605 NEW HI-SCORE \u2605", centerX, 420)),
                Math.floor(timestamp / 500) % 2 === 0 &&
                    ((ctx.font = '12px "Press Start 2P"'),
                    (ctx.fillStyle = "#fff"),
                    (ctx.shadowColor = "#06ffa5"),
                    (ctx.shadowBlur = 12),
                    ctx.fillText(useTouchControls ? "TAP TO RETRY" : "PRESS SPACE TO RETRY", centerX, 475)),
                (ctx.shadowBlur = 0),
                (ctx.textAlign = "left");
        }

        function drawPauseScreen() {
            (ctx.fillStyle = "rgba(0, 0, 0, 0.7)"),
                ctx.fillRect(0, 0, canvasWidth, canvasHeight),
                (ctx.textAlign = "center"),
                (ctx.font = '44px "Press Start 2P"'),
                (ctx.fillStyle = "#ffbe0b"),
                (ctx.shadowColor = "#ffbe0b"),
                (ctx.shadowBlur = 22),
                ctx.fillText("PAUSED", canvasWidth / 2, canvasHeight / 2 - 10),
                (ctx.font = '11px "Press Start 2P"'),
                (ctx.fillStyle = "#fff"),
                (ctx.shadowColor = "#fff"),
                (ctx.shadowBlur = 8),
                ctx.fillText(useTouchControls ? "TAP TO RESUME" : "PRESS P TO RESUME", canvasWidth / 2, canvasHeight / 2 + 40),
                (ctx.shadowBlur = 0),
                (ctx.textAlign = "left");
        }

        function resumeAudio() {
            ensureAudio(), audioContext && audioContext.state === "suspended" && audioContext.resume();
        }

        function movePieceHorizontal(direction) {
            gamePhase === "playing" && (collides(currentPiece, direction, 0) || ((currentPiece.x += direction), playSound(220, 0.025, "square", 0.04)));
        }

        function softDrop() {
            gamePhase === "playing" && (collides(currentPiece, 0, 1) || (currentPiece.y++, (score += 1)));
        }

        function startGame() {
            resetGame(), (gamePhase = "playing");
        }

        function togglePause() {
            gamePhase === "playing" ? (gamePhase = "paused") : gamePhase === "paused" && (gamePhase = "playing");
        }

        document.addEventListener("keydown", (event) => {
            if ((resumeAudio(), event.code === "KeyM")) {
                (isMuted = !isMuted), event.preventDefault();
                return;
            }

            if (gamePhase === "title" || gamePhase === "gameover") {
                event.code === "Space" && (startGame(), event.preventDefault());
                return;
            }

            if (gamePhase === "paused") {
                event.code === "KeyP" && togglePause();
                return;
            }

            if (gamePhase === "playing") {
                if (event.code === "KeyP") {
                    togglePause();
                    return;
                }

                event.code === "ArrowLeft" || event.code === "KeyA"
                    ? (movePieceHorizontal(-1), event.preventDefault())
                    : event.code === "ArrowRight" || event.code === "KeyD"
                      ? (movePieceHorizontal(1), event.preventDefault())
                      : event.code === "ArrowUp" || event.code === "KeyW"
                        ? (rotateCurrentPiece(), event.preventDefault())
                        : event.code === "ArrowDown" || event.code === "KeyS"
                          ? (softDrop(), event.preventDefault())
                          : event.code === "Space" && (hardDrop(), event.preventDefault());
            }
        });

        let gestureTracker = createGestureTracker(),
            hudHeight = 52,
            muteButtonWidth = 90;

        function getCanvasRect() {
            return canvas.getBoundingClientRect();
        }

        function getScreenCellSize(canvasRect) {
            return canvasRect.width > 0 ? (canvasRect.width / canvasWidth) * cellSize : cellSize;
        }

        function applyTouchAction(action) {
            action === "left" ? movePieceHorizontal(-1) : action === "right" ? movePieceHorizontal(1) : action === "soft" ? softDrop() : action === "slam" && gamePhase === "playing" && hardDrop();
        }

        function handleTap(clientX, clientY) {
            let canvasRect = getCanvasRect(),
                screenX = canvasRect.width > 0 ? ((clientX - canvasRect.left) / canvasRect.width) * canvasWidth : 0,
                screenY = canvasRect.height > 0 ? ((clientY - canvasRect.top) / canvasRect.height) * canvasHeight : canvasHeight,
                tapAction = mapTapToAction(screenX, screenY, gamePhase, { width: canvasWidth, hudHeight: hudHeight, muteWidth: muteButtonWidth });
            tapAction === "start"
                ? startGame()
                : tapAction === "pause" || tapAction === "resume"
                  ? togglePause()
                  : tapAction === "mute"
                    ? (isMuted = !isMuted)
                    : tapAction === "rotate" && rotateCurrentPiece();
        }

        canvas.addEventListener(
            "touchstart",
            (event) => {
                resumeAudio(), (useTouchControls = !0), event.preventDefault();
                let touch = event.changedTouches[0];
                gestureTracker.start({ id: touch.identifier, x: touch.clientX, y: touch.clientY, at: performance.now() });
            },
            { passive: !1 }
        ),
            canvas.addEventListener(
                "touchmove",
                (event) => {
                    let canvasRect = getCanvasRect();
                    for (let touchIndex = 0; touchIndex < event.changedTouches.length; touchIndex++) {
                        let touch = event.changedTouches[touchIndex];
                        if (!gestureTracker.tracking(touch.identifier)) continue;
                        event.preventDefault();
                        let dragActions = gestureTracker.move({ id: touch.identifier, x: touch.clientX, y: touch.clientY }, getScreenCellSize(canvasRect));
                        for (let action of dragActions) applyTouchAction(action);
                    }
                },
                { passive: !1 }
            ),
            canvas.addEventListener(
                "touchend",
                (event) => {
                    let canvasRect = getCanvasRect();
                    for (let touchIndex = 0; touchIndex < event.changedTouches.length; touchIndex++) {
                        let touch = event.changedTouches[touchIndex];
                        if (!gestureTracker.tracking(touch.identifier)) continue;
                        event.preventDefault();
                        let gestureResult = gestureTracker.end({ id: touch.identifier, x: touch.clientX, y: touch.clientY, at: performance.now() }, getScreenCellSize(canvasRect));
                        gestureResult && (gestureResult.action === "tap" ? handleTap(gestureResult.x, gestureResult.y) : applyTouchAction(gestureResult.action));
                    }
                },
                { passive: !1 }
            ),
            canvas.addEventListener(
                "touchcancel",
                (event) => {
                    for (let touchIndex = 0; touchIndex < event.changedTouches.length; touchIndex++) gestureTracker.cancel(event.changedTouches[touchIndex].identifier);
                },
                { passive: !1 }
            );
        let previousFrameTime = 0;

        function gameLoop(timestamp) {
            let deltaMs = Math.min(50, timestamp - previousFrameTime);
            if (((previousFrameTime = timestamp), gamePhase === "playing")) {
                levelProgressTimer += deltaMs;
                let computedLevel = Math.floor(levelProgressTimer / 22e3) + 1;
                computedLevel > level &&
                    ((level = computedLevel),
                    (gravityInterval = Math.max(140, 850 - level * 65)),
                    (enemySpawnInterval = Math.max(1100, 4500 - level * 320)),
                    playSound(660, 0.08, "square", 0.07),
                    playSound(880, 0.12, "square", 0.06)),
                    (gravityTimer += deltaMs),
                    gravityTimer >= gravityInterval && ((gravityTimer = 0), collides(currentPiece, 0, 1) ? lockPiece(currentPiece) : currentPiece.y++),
                    (enemySpawnCountdown -= deltaMs),
                    enemySpawnCountdown <= 0 && (spawnEnemy(), (enemySpawnCountdown = enemySpawnInterval * (0.65 + Math.random() * 0.7))),
                    updateEnemies(deltaMs),
                    updateParticles(deltaMs),
                    screenShakeRemaining > 0 && ((screenShakeRemaining -= deltaMs), screenShakeRemaining <= 0 && (screenShakeAmount = 0)),
                    breachFlashRemaining > 0 && (breachFlashRemaining -= deltaMs),
                    scorePopupRemaining > 0 && (scorePopupRemaining -= deltaMs);
            } else gamePhase === "gameover" && (updateParticles(deltaMs), screenShakeRemaining > 0 && ((screenShakeRemaining -= deltaMs), screenShakeRemaining <= 0 && (screenShakeAmount = 0)));

            if ((ctx.save(), screenShakeAmount > 0 && screenShakeRemaining > 0)) {
                let shakeOffsetX = (Math.random() - 0.5) * screenShakeAmount,
                    shakeOffsetY = (Math.random() - 0.5) * screenShakeAmount;
                ctx.translate(shakeOffsetX, shakeOffsetY);
            }

            if (gamePhase === "title") drawTitleScreen(timestamp);
            
            else {
                drawBackground(timestamp), drawBorderSign(), drawGrid();
                let sortedEnemies = [...enemies].sort((leftEnemy, rightEnemy) => leftEnemy.x - rightEnemy.x);
                for (let enemy of sortedEnemies) drawEnemy(enemy, timestamp);
                drawLockedBricks(),
                    drawBoardBorder(),
                    (gamePhase === "playing" || gamePhase === "paused") && (drawGhostPiece(), drawActivePiece()),
                    drawParticles(),
                    drawHud(),
                    breachFlashRemaining > 0 && ((ctx.fillStyle = `rgba(255, 20, 60, ${(breachFlashRemaining / 400) * 0.45})`), ctx.fillRect(0, 0, canvasWidth, canvasHeight)),
                    gamePhase === "paused" && drawPauseScreen(),
                    gamePhase === "gameover" && drawGameOverScreen(timestamp);
            }
            ctx.restore(), requestAnimationFrame(gameLoop);
        }
        resetGame(), (gamePhase = "title"), requestAnimationFrame(gameLoop);
    })();
})();
