# Child Game Notification System Guide

This guide explains how to implement the notification system in the child-facing PWA game.

## Overview 📱

When a child plays the game, they can trigger notifications to grandparents/guests:

1. **Free Game (Single Grandparent):**
   - found_count = 1: Text notification ("You were found in the castle!")
   - found_count = 2: Screenshot of found moment
   - found_count = 3: Show coloring page → Child draws → Screenshot of colored page
   - found_count resets to 0

2. **Full Family Game (Multiple Members):**
   - Any member found: Screenshot to that member
   - Coloring page complete: Screenshot to owner (with all family members)

## API Endpoints 🔧

### 1. Send Notification

**Endpoint:** `POST /api/send-notification`

**Usage:**
```javascript
const sendNotification = async (familyMemberId, title, body, image) => {
  const response = await fetch('/api/send-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      familyMemberId, // UUID of the family member
      title,          // Notification title
      body,           // Notification body text
      image,          // Optional: base64 image URL for screenshot
    })
  });
  
  return response.json();
};
```

### 2. Coloring Page Complete

**Endpoint:** `POST /api/coloring-complete`

**Usage:**
```javascript
const coloringComplete = async (familyCode, childName, screenshot, foundMemberIds) => {
  const response = await fetch('/api/coloring-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      familyCode,      // Family code string
      childName,       // Child's name (optional)
      screenshot,      // base64 data URL of colored page
      foundMemberIds,  // Array of member IDs who were found (optional)
    })
  });
  
  return response.json();
};
```

## Free Game Implementation 🎮

### When Grandparent is Found

```javascript
const handleFoundGrandparent = async (location) => {
  // 1. Get owner's current found_count
  const { data: owner } = await supabase
    .from('family_members')
    .select('id, found_count, push_subscription')
    .eq('role', 'owner')
    .eq('family_code', familyCode)
    .single();
  
  if (!owner) {
    console.error('Owner not found');
    return;
  }
  
  const newCount = owner.found_count + 1;
  
  // 2. Increment found_count
  await supabase
    .from('family_members')
    .update({ found_count: newCount })
    .eq('role', 'owner');
  
  // 3. Send notification based on count
  if (newCount === 1) {
    // TEXT ONLY
    await sendNotification(
      owner.id,
      '🎉 You were found!',
      `Emma found you in the ${location}!`
    );
  }
  else if (newCount === 2) {
    // SCREENSHOT OF FOUND MOMENT
    const screenshot = await captureFoundMoment();
    await sendNotification(
      owner.id,
      '🎉 You were found again!',
      `Emma found you in the ${location}! Look at this moment!`,
      screenshot
    );
  }
  else if (newCount === 3) {
    // TRIGGER COLORING PAGE FLOW
    await showColoringPage(); // Opens canvas for child to draw
  }
};
```

### When Child Finishes Coloring Page

```javascript
const handleColoringPageComplete = async () => {
  // 1. Capture the colored page
  const coloredScreenshot = await captureColoredPage();
  
  // 2. Call coloring-complete API
  await coloringComplete(
    familyCode,
    childName, // e.g., "Emma"
    coloredScreenshot,
    [ownerId] // Who was found
  );
  
  // 3. Show success message to child
  alert('Great job! Your grandparent will love this!');
};
```

## Full Family Game Implementation 👨‍👩‍👧‍👦

### When ANY Family Member is Found

```javascript
const handleFoundFamilyMember = async (member, location) => {
  // 1. Capture screenshot of found moment
  const screenshot = await captureFoundMoment();
  
  // 2. Send notification to THIS person (who was found)
  await sendNotification(
    member.id,
    `🎉 You were found!`,
    `${childName} found you in the ${location}!`,
    screenshot
  );
  
  // 3. Track this find for the owner
  const { data: session } = await supabase
    .from('coloring_sessions')
    .select('found_members, id')
    .eq('family_code', familyCode)
    .is('notification_sent', false)
    .maybeSingle();
  
  if (session) {
    // Add to existing session
    await supabase
      .from('coloring_sessions')
      .update({
        found_members: [...session.found_members, member.id]
      })
      .eq('id', session.id);
  } else {
    // Start new session
    await supabase
      .from('coloring_sessions')
      .insert({
        family_code: familyCode,
        child_name: childName,
        found_members: [member.id],
        notification_sent: false
      });
  }
  
  // 4. Check if all family members found (or enough to show coloring page)
  // Then show coloring page...
};
```

### When Coloring Page is Complete (Full Family)

```javascript
const handleColoringPageComplete = async () => {
  // 1. Capture the colored page with ALL family members
  const coloredScreenshot = await captureColoredPage();
  
  // 2. Call coloring-complete API
  // This automatically sends to OWNER and resets found_count
  await coloringComplete(
    familyCode,
    childName,
    coloredScreenshot,
    foundMemberIds // Array of all family members who were found
  );
  
  // 3. Show success message
  alert('Amazing! Your family will love this!');
};
```

## HTML5 Canvas Implementation 🎨

### Canvas Setup

```html
<canvas 
  id="coloring-canvas" 
  width="1024" 
  height="768"
  style="border: 2px solid #ccc; touch-action: none;"
></canvas>

<button id="done-button">I'm Done! 🎨</button>
```

### Capture Colored Page Function

```javascript
const captureColoredPage = () => {
  const canvas = document.getElementById('coloring-canvas');
  
  // Export as high-quality PNG
  const dataURL = canvas.toDataURL('image/png', 1.0);
  
  return dataURL; // Return base64 for push notification
};
```

### Load Coloring Page on Canvas

```javascript
const loadColoringPage = async (coloringPageUrl) => {
  const canvas = document.getElementById('coloring-canvas');
  const ctx = canvas.getContext('2d');
  
  const img = new Image();
  img.onload = () => {
    // Draw coloring page outline
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    // Enable drawing
    enableDrawing(canvas, ctx);
  };
  img.src = coloringPageUrl;
};
```

### Enable Drawing on Canvas

```javascript
const enableDrawing = (canvas, ctx) => {
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  
  // Mouse events
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
  
  // Touch events (for tablets)
  canvas.addEventListener('touchstart', handleTouchStart);
  canvas.addEventListener('touchmove', handleTouchMove);
  canvas.addEventListener('touchend', stopDrawing);
  
  function startDrawing(e) {
    isDrawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
  }
  
  function draw(e) {
    if (!isDrawing) return;
    
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.strokeStyle = '#FF0000'; // Red color
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    [lastX, lastY] = [e.offsetX, e.offsetY];
  }
  
  function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    lastX = touch.clientX - rect.left;
    lastY = touch.clientY - rect.top;
    isDrawing = true;
  }
  
  function handleTouchMove(e) {
    e.preventDefault();
    if (!isDrawing) return;
    
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    lastX = x;
    lastY = y;
  }
  
  function stopDrawing() {
    isDrawing = false;
  }
};
```

### Done Button Handler

```javascript
document.getElementById('done-button').addEventListener('click', async () => {
  const screenshot = captureColoredPage();
  
  await coloringComplete(
    familyCode,
    childName,
    screenshot,
    foundMemberIds
  );
  
  alert('Sent to your grandparent! 🎉');
});
```

## Found Moment Screenshot 📸

```javascript
const captureFoundMoment = () => {
  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  
  // Draw current game state
  // This depends on your game engine/renderer
  // For example, if using Phaser:
  // game.renderer.snapshot((image) => {
  //   ctx.drawImage(image, 0, 0);
  // });
  
  // Or if using plain canvas:
  ctx.drawImage(gameCanvas, 0, 0);
  
  return canvas.toDataURL('image/png', 1.0);
};
```

## Complete Example Flow 📋

```javascript
// Example: Free game flow
class GrandparentGame {
  async onFoundGrandparent(location) {
    const { data: owner } = await supabase
      .from('family_members')
      .select('id, found_count')
      .eq('role', 'owner')
      .single();
    
    const newCount = owner.found_count + 1;
    
    await supabase
      .from('family_members')
      .update({ found_count: newCount })
      .eq('id', owner.id);
    
    if (newCount === 1) {
      // Text notification
      await this.sendNotification(owner.id, 'Found!', `In the ${location}`);
    } else if (newCount === 2) {
      // Screenshot
      const screenshot = this.captureGame();
      await this.sendNotification(owner.id, 'Found again!', 'Look!', screenshot);
    } else if (newCount === 3) {
      // Show coloring page
      this.showColoringPage();
    }
  }
  
  async onColoringComplete() {
    const screenshot = this.captureCanvas();
    await fetch('/api/coloring-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        familyCode: this.familyCode,
        childName: this.childName,
        screenshot: screenshot,
      })
    });
    
    alert('Sent! 🎉');
  }
  
  sendNotification(memberId, title, body, image) {
    return fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyMemberId: memberId, title, body, image })
    });
  }
  
  captureGame() {
    // Return screenshot of current game state
    return document.getElementById('game-canvas').toDataURL();
  }
  
  captureCanvas() {
    return document.getElementById('coloring-canvas').toDataURL();
  }
}
```

## Environment Variables 📝

Make sure these are set in your `.env.local`:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Testing 🧪

1. **Test text notification:** Set found_count to 0, find grandparent once
2. **Test screenshot:** Find grandparent twice
3. **Test coloring page:** Find grandparent 3 times, complete coloring
4. **Test full family:** Add multiple members, find each one

## Troubleshooting 🔧

**Notifications not sending?**
- Check VAPID keys are set correctly
- Verify push_subscription exists in database
- Check browser console for errors

**Screenshot not working?**
- Ensure canvas has correct dimensions
- Check if canvas is fully rendered before capturing
- Verify CORS headers if loading images from different domain

**found_count not incrementing?**
- Check RLS policies on family_members table
- Verify Supabase client has correct headers
- Check browser network tab for failed requests

## Support 💬

For issues or questions, refer to the main README or contact support.