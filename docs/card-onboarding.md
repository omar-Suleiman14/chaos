# First-account Card setup
Only newly inserted accounts receive the pending flag. Existing rows without that flag remain initialized. The dashboard first shows the real animated Card, name/username fields, style cycling and generated-avatar choices. Save persists completion and presents “Your card is ready”; Continue returns to the intended dashboard route. Skip persists completion without requiring any personalization. Profile allows later editing.

Name choices survive identity-provider synchronization. Username changes reserve both old and new names through the existing alias model. Generated avatar seeds are stored with the Card and used in public views. The existing Card animation honors reduced motion.

MCP `get_my_card` and `customize_my_card` act only on the authenticated account. Completion is explicit; tools do not silently complete onboarding when reading a Card.
