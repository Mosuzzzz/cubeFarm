package app

import "testing"

func TestLineSignature(t *testing.T) {
	body := []byte(`{"events":[]}`)
	if !validLineSignature(body, "pkK1lVPJPiJ+wPLziRD79xIxohl8AImYM8AEeM7IbzQ=", "secret") {
		t.Fatal("expected valid signature")
	}
	if validLineSignature(body, "bad", "secret") {
		t.Fatal("expected invalid signature")
	}
}

func TestChatbotFallsBackWithoutAPIKey(t *testing.T) {
	t.Setenv("GROQ_API_KEY", "")
	a := &App{}
	got := a.handleLineCommand("ต้นไม้ใบเหลืองควรทำอย่างไร")
	if got != chatbotFallback() {
		t.Fatalf("expected chatbot fallback, got %q", got)
	}
}
