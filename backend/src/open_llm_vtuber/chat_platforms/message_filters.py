"""
Message filtering and selection system for chat platforms.
Includes spam detection, message quality scoring, and response selection.
"""

import re
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from collections import defaultdict, deque
from loguru import logger
from .base_platform import ChatMessage


class SpamFilter:
    """
    Detects spam messages using multiple heuristics and pattern matching.
    
    The spam filter uses a multi-stage approach:
    1. Length validation (too short < 2 chars or too long > 500 chars)
    2. Pattern matching (URLs, excessive caps, special chars, repeated characters)
    3. Emoji detection (excessive emoji in short messages)
    4. Rate limiting (max 5 messages per minute per user)
    5. Duplicate detection (same message appearing 3+ times)
    6. Spam keyword detection (common spam phrases)
    
    Returns a tuple of (is_spam: bool, reason: str) where reason explains why
    the message was flagged, or empty string if not spam.
    
    Example:
        >>> filter = SpamFilter()
        >>> is_spam, reason = filter.is_spam(chat_message)
        >>> if is_spam:
        ...     print(f"Spam detected: {reason}")
    """
    
    def __init__(self):
        # Spam patterns
        self.spam_patterns = [
            r'https?://[^\s]+',  # URLs (can be configured to allow/deny)
            r'[A-Z]{5,}',  # Excessive caps
            r'[!@#$%^&*()]{3,}',  # Excessive special chars
            r'(.)\1{4,}',  # Repeated characters (e.g., "aaaaa")
        ]
        
        # User tracking for rate limiting
        self.user_message_times: Dict[str, deque] = defaultdict(lambda: deque(maxlen=10))
        self.user_message_counts: Dict[str, int] = defaultdict(int)
        
        # Message frequency limits
        self.max_messages_per_minute = 5
        self.max_similar_messages = 3
        
        # Recent messages for duplicate detection
        self.recent_messages: deque = deque(maxlen=50)
        
    def is_spam(self, message: ChatMessage) -> Tuple[bool, str]:
        """
        Check if a message is spam using multiple detection methods.
        
        The detection process checks in this order:
        1. Message length (must be 2-500 characters)
        2. Regex pattern matching (URLs, caps, special chars, repetitions)
        3. Emoji count (max 5 emoji in messages < 20 chars)
        4. User rate limiting (max 5 messages per minute)
        5. Duplicate message detection (same text appearing 3+ times)
        6. Spam keyword detection (common spam phrases)
        
        Args:
            message: The ChatMessage object to check for spam
            
        Returns:
            Tuple of (is_spam: bool, reason: str):
            - is_spam: True if message is spam, False otherwise
            - reason: String explaining why it's spam (e.g., "contains_url", 
                     "rate_limit_exceeded"), or empty string if not spam
                     
        Spam Reason Codes:
            - "message_too_short": Message has less than 2 characters
            - "message_too_long": Message has more than 500 characters
            - "contains_url": Message contains HTTP/HTTPS URLs
            - "excessive_emoji": More than 5 emoji in a message < 20 chars
            - "rate_limit_exceeded": User sent > 5 messages in the last minute
            - "duplicate_message": Same message text appeared 3+ times recently
            - "contains_spam_keyword_{keyword}": Contains known spam phrase
            - "matches_spam_pattern_{pattern}": Matches regex spam pattern
        """
        msg_text = message.message.lower().strip()
        
        # Check for empty or very short messages
        if len(msg_text) < 2:
            return True, "message_too_short"
        
        # Check for excessive length (likely spam or copy-paste)
        if len(msg_text) > 500:
            return True, "message_too_long"
        
        # Check spam patterns
        for pattern in self.spam_patterns:
            if re.search(pattern, message.message, re.IGNORECASE):
                # URLs might be okay in some contexts, but for now mark as spam
                if 'http' in pattern:
                    return True, "contains_url"
                return True, f"matches_spam_pattern_{pattern}"
        
        # Check for excessive emoji (more than 5 emoji in a short message)
        emoji_count = len(re.findall(r'[\U0001F300-\U0001F9FF]', message.message))
        if emoji_count > 5 and len(msg_text) < 20:
            return True, "excessive_emoji"
        
        # Check for duplicate messages from same user
        username = message.username.lower()
        now = datetime.now()
        
        # Rate limiting: check if user is sending too many messages
        if username in self.user_message_times:
            recent_times = [
                t for t in self.user_message_times[username]
                if (now - t).total_seconds() < 60
            ]
            if len(recent_times) >= self.max_messages_per_minute:
                return True, "rate_limit_exceeded"
        
        # Update user message tracking
        self.user_message_times[username].append(now)
        self.user_message_counts[username] += 1
        
        # Check for duplicate messages (same text from different users)
        msg_normalized = re.sub(r'\s+', ' ', msg_text).strip()
        duplicate_count = sum(
            1 for recent_msg in self.recent_messages
            if recent_msg.lower().strip() == msg_normalized
        )
        if duplicate_count >= self.max_similar_messages:
            return True, "duplicate_message"
        
        # Add to recent messages
        self.recent_messages.append(msg_text)
        
        # Check for common spam words/phrases
        spam_keywords = [
            'buy now', 'click here', 'free money', 'guaranteed profit',
            'pump it', 'to the moon', 'scam', 'hack', 'cheat',
        ]
        for keyword in spam_keywords:
            if keyword in msg_text:
                return True, f"contains_spam_keyword_{keyword}"
        
        return False, ""
    
    def reset_user_tracking(self, username: str):
        """Reset tracking for a specific user."""
        username_lower = username.lower()
        self.user_message_times.pop(username_lower, None)
        self.user_message_counts.pop(username_lower, None)


class MessageSelector:
    """
    Selects which messages to respond to based on quality scoring.
    
    The MessageSelector uses a weighted scoring system to evaluate message quality:
    - Length Score (10%): Prefers messages 10-200 characters long
    - Question Score (30%): Gives full points to messages with question marks
    - Mention Score (20%): Gives points if character name is mentioned
    - Engagement Score (20%): Scores based on exclamation marks (1-3 is ideal)
    - Uniqueness Score (20%): Assumes most messages are somewhat unique
    
    Only messages with a total quality score >= 0.3 (configurable) will be
    selected for response. Additionally, enforces a 30-second cooldown between
    responses to the same user to prevent over-responding.
    
    The selector first checks spam filtering, then calculates quality score,
    and finally checks response cooldown before deciding to respond.
    
    Example:
        >>> selector = MessageSelector()
        >>> should_respond, score, reason = selector.should_respond(
        ...     chat_message, 
        ...     character_name="CharacterName"
        ... )
        >>> if should_respond:
        ...     print(f"Quality score: {score:.2f}")
    """
    
    def __init__(self):
        self.spam_filter = SpamFilter()
        
        # Quality scoring weights
        self.weights = {
            'length': 0.1,  # Prefer messages of reasonable length
            'question': 0.3,  # Prefer questions
            'mention': 0.2,  # Prefer messages that mention the character
            'engagement': 0.2,  # Prefer messages that seem engaging
            'uniqueness': 0.2,  # Prefer unique messages
        }
        
        # Minimum quality score to respond
        self.min_quality_score = 0.3
        
        # Track recent responses to avoid responding to same user too frequently
        self.recent_responses: Dict[str, datetime] = {}
        self.min_response_interval = timedelta(seconds=30)  # Don't respond to same user more than once per 30s
        
    def should_respond(self, message: ChatMessage, character_name: Optional[str] = None) -> Tuple[bool, float, str]:
        """
        Determine if we should respond to a message based on spam filtering and quality scoring.
        
        Processing steps:
        1. First checks spam filter - if spam, immediately returns False
        2. Checks if we recently responded to this user (30-second cooldown)
        3. Calculates quality score using weighted components
        4. Compares score to minimum threshold (default 0.3)
        
        Args:
            message: The ChatMessage object to evaluate
            character_name: Optional character name to check for mentions in the message.
                           If provided, messages mentioning the character get bonus points.
            
        Returns:
            Tuple of (should_respond: bool, quality_score: float, reason: str):
            - should_respond: True if message should receive a response, False otherwise
            - quality_score: Calculated quality score (0.0 to 1.0)
            - reason: Explanation string:
                * "spam_{spam_reason}": Message failed spam check
                * "recent_response_to_user": Responded to this user < 30s ago
                * "quality_threshold_met": Score >= 0.3, will respond
                * "quality_score_too_low": Score < 0.3, skipping
                
        Quality Score Calculation:
            The score is a weighted sum of 5 components (total can exceed 1.0, but is capped at 1.0):
            - Length: 0.1 weight (prefers 10-200 chars)
            - Question: 0.3 weight (full points if contains "?")
            - Mention: 0.2 weight (full points if character name mentioned)
            - Engagement: 0.2 weight (0.8x for 1-3 "!", 0.5x for 0 "!")
            - Uniqueness: 0.2 weight (currently 0.7x default)
        """
        # First check spam filter
        is_spam, spam_reason = self.spam_filter.is_spam(message)
        if is_spam:
            return False, 0.0, f"spam_{spam_reason}"
        
        # Check if we recently responded to this user
        username = message.username.lower()
        if username in self.recent_responses:
            time_since_last = datetime.now() - self.recent_responses[username]
            if time_since_last < self.min_response_interval:
                return False, 0.0, "recent_response_to_user"
        
        # Calculate quality score
        score = self._calculate_quality_score(message, character_name)
        
        if score >= self.min_quality_score:
            # Update recent responses
            self.recent_responses[username] = datetime.now()
            return True, score, "quality_threshold_met"
        else:
            return False, score, "quality_score_too_low"
    
    def _calculate_quality_score(self, message: ChatMessage, character_name: Optional[str] = None) -> float:
        """
        Calculate quality score for a message using weighted components.
        
        The quality score is computed as a weighted sum of five factors:
        1. Length Score (weight: 0.1): 
           - 10-200 chars: 1.0 multiplier (full points)
           - 5-10 or 200-300 chars: 0.5 multiplier
           - Otherwise: 0.1 multiplier
           
        2. Question Score (weight: 0.3):
           - Contains "?": 1.0 multiplier (full points)
           - No "?": 0.0 multiplier
           
        3. Mention Score (weight: 0.2):
           - Character name found (case-insensitive): 1.0 multiplier
           - No mention: 0.0 multiplier
           
        4. Engagement Score (weight: 0.2):
           - 1-3 exclamation marks: 0.8 multiplier
           - 0 exclamation marks: 0.5 multiplier
           - > 3 exclamation marks: 0.0 multiplier (excessive)
           
        5. Uniqueness Score (weight: 0.2):
           - Currently uses default 0.7 multiplier
           - Future: Could check similarity to recent messages
        
        Args:
            message: The ChatMessage to score
            character_name: Optional character name for mention detection
            
        Returns:
            float: Quality score between 0.0 and 1.0 (capped at 1.0)
            
        Example:
            Message: "Hey! What do you think? @CharacterName" (50 chars, 1 "!", 1 "?")
            - Length: 0.1 * 1.0 = 0.1
            - Question: 0.3 * 1.0 = 0.3
            - Mention: 0.2 * 1.0 = 0.2
            - Engagement: 0.2 * 0.8 = 0.16
            - Uniqueness: 0.2 * 0.7 = 0.14
            Total: 0.9
        """
        msg_text = message.message
        score = 0.0
        
        # Length score (prefer 10-200 characters)
        length = len(msg_text)
        if 10 <= length <= 200:
            score += self.weights['length'] * 1.0
        elif 5 <= length < 10 or 200 < length <= 300:
            score += self.weights['length'] * 0.5
        else:
            score += self.weights['length'] * 0.1
        
        # Question score (messages with question marks)
        if '?' in msg_text:
            score += self.weights['question'] * 1.0
        
        # Mention score (if character name is mentioned)
        if character_name:
            if character_name.lower() in msg_text.lower():
                score += self.weights['mention'] * 1.0
        
        # Engagement score (exclamation marks, but not excessive)
        exclamation_count = msg_text.count('!')
        if 1 <= exclamation_count <= 3:
            score += self.weights['engagement'] * 0.8
        elif exclamation_count == 0:
            score += self.weights['engagement'] * 0.5
        
        # Uniqueness score (check if message is similar to recent ones)
        # This is simplified - in production, could use more sophisticated similarity
        score += self.weights['uniqueness'] * 0.7  # Assume most messages are somewhat unique
        
        return min(score, 1.0)  # Cap at 1.0
    
    def reset_response_tracking(self):
        """Reset response tracking (useful for testing or periodic cleanup)."""
        # Remove old entries (older than 5 minutes)
        cutoff = datetime.now() - timedelta(minutes=5)
        self.recent_responses = {
            user: time for user, time in self.recent_responses.items()
            if time > cutoff
        }


class ResponseSelector:
    """
    Generates multiple response options and selects the best one based on quality criteria.
    
    The ResponseSelector uses a multi-option approach:
    1. Generates 3 response options (configurable) with slight prompt variations
    2. Scores each response on three dimensions:
       - Length (40%): Prefers 20-150 characters for chat
       - Uniqueness (30%): Prefers responses different from other options
       - Naturalness (30%): Prefers non-repetitive text
    3. Selects the response with the highest total score
    
    This approach ensures we get diverse, high-quality responses rather than
    just using the first generated response.
    
    Example:
        >>> selector = ResponseSelector()
        >>> best_response = await selector.select_best_response(
        ...     context_cache,
        ...     chat_message,
        ...     context,
        ...     num_options=3
        ... )
    """
    
    def __init__(self, max_responses: int = 3):
        self.max_responses = max_responses
        
    async def select_best_response(
        self,
        context_cache: Any,  # ServiceContext
        chat_message: ChatMessage,
        context: Dict[str, Any],
        num_options: int = 3
    ) -> Optional[str]:
        """
        Generate multiple response options and select the best one based on scoring.
        
        Process:
        1. Generates `num_options` response variations using the agent engine
        2. Each variation uses a slightly modified prompt to encourage diversity
        3. Scores each response on length, uniqueness, and naturalness
        4. Returns the response with the highest total score
        
        Args:
            context_cache: ServiceContext containing agent engine and character config
            chat_message: The ChatMessage object to respond to
            context: Additional context dictionary (platform, username, etc.)
            num_options: Number of response options to generate (default: 3)
            
        Returns:
            Optional[str]: The selected best response text, or None if:
            - No responses were successfully generated
            - All generated responses were empty
            
        Response Scoring:
            Each response is scored on three criteria (total max: 1.0):
            - Length (0.4): 20-150 chars = 0.4, 10-20 or 150-200 = 0.2, else = 0.1
            - Uniqueness (0.3): Based on word overlap with other options
            - Naturalness (0.3): 0.3 if not repetitive, 0.0 if repetitive
        """
        from ..conversations.conversation_utils import create_batch_input
        
        responses = []
        
        # Generate multiple response options
        for i in range(num_options):
            try:
                # Create batch input with slight variation in prompt
                prompt_variation = self._add_variation(chat_message.message, i)
                batch_input = create_batch_input(
                    input_text=prompt_variation,
                    images=None,
                    from_name=chat_message.username,
                )
                
                # Generate response
                full_response = ""
                agent_output = context_cache.agent_engine.chat(batch_input)
                
                async for output in agent_output:
                    if hasattr(output, 'display_text') and hasattr(output.display_text, 'text'):
                        full_response += output.display_text.text
                    elif hasattr(output, 'transcript'):
                        full_response += output.transcript
                    elif isinstance(output, str):
                        full_response += output
                
                if full_response and len(full_response.strip()) > 0:
                    responses.append(full_response.strip())
                    
            except Exception as e:
                logger.error(f"Error generating response option {i}: {e}")
                continue
        
        if not responses:
            return None
        
        # Select the best response based on criteria
        best_response = self._select_best(responses, chat_message)
        
        return best_response
    
    def _add_variation(self, message: str, variation_index: int) -> str:
        """
        Add slight variation to the message prompt to get different responses.
        This is a simple approach - in production, could use more sophisticated methods.
        """
        # For now, just return the original message
        # In the future, could add context hints like:
        # - "Respond briefly: {message}"
        # - "Respond enthusiastically: {message}"
        # - "Respond thoughtfully: {message}"
        variations = [
            message,  # Original
            f"{message} (respond briefly)",
            f"{message} (respond naturally)",
        ]
        return variations[variation_index % len(variations)]
    
    def _select_best(self, responses: List[str], original_message: ChatMessage) -> str:
        """
        Select the best response from multiple options using scoring criteria.
        
        Scores each response on three dimensions:
        1. Length Score (0.4 weight): Prefers 20-150 characters
        2. Uniqueness Score (0.3 weight): Prefers responses different from others
           - Calculates Jaccard similarity (word overlap) with other responses
           - Higher uniqueness = lower similarity = higher score
        3. Naturalness Score (0.3 weight): Prefers non-repetitive text
           - Checks if any word appears 3+ times in messages < 20 words
           - Repetitive responses get 0 points
        
        Args:
            responses: List of response text options to choose from
            original_message: The original chat message (for context, currently unused)
            
        Returns:
            str: The response with the highest total score
            
        Note:
            If only one response is provided, it is returned without scoring.
        """
        if len(responses) == 1:
            return responses[0]
        
        # Score each response
        scored_responses = []
        for response in responses:
            score = 0.0
            
            # Length score (prefer 20-150 characters for chat)
            length = len(response)
            if 20 <= length <= 150:
                score += 0.4
            elif 10 <= length < 20 or 150 < length <= 200:
                score += 0.2
            else:
                score += 0.1
            
            # Uniqueness score (prefer responses that are different from others)
            similarity_to_others = sum(
                self._similarity(response, other) 
                for other in responses 
                if other != response
            ) / max(len(responses) - 1, 1)
            score += (1.0 - similarity_to_others) * 0.3
            
            # Naturalness score (check for repetition)
            if not self._is_repetitive(response):
                score += 0.3
            
            scored_responses.append((score, response))
        
        # Sort by score and return the best
        scored_responses.sort(key=lambda x: x[0], reverse=True)
        return scored_responses[0][1]
    
    def _similarity(self, text1: str, text2: str) -> float:
        """Simple similarity metric (0.0 = completely different, 1.0 = identical)."""
        # Simple word overlap
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = words1 & words2
        union = words1 | words2
        
        return len(intersection) / len(union) if union else 0.0
    
    def _is_repetitive(self, text: str) -> bool:
        """Check if text is repetitive (e.g., "hello hello hello")."""
        words = text.lower().split()
        if len(words) < 3:
            return False
        
        # Check for repeated words
        word_counts = {}
        for word in words:
            word_counts[word] = word_counts.get(word, 0) + 1
        
        # If any word appears more than 3 times in a short message, it's repetitive
        max_count = max(word_counts.values()) if word_counts else 0
        return max_count > 3 and len(words) < 20

