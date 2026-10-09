package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/patiphan/cubefarm/services/api/internal/app"
)

func main() {
	server, cleanup, err := app.New()
	if err != nil {
		log.Fatal(err)
	}
	defer cleanup()

	errCh := make(chan error, 1)
	go func() { log.Printf("Smart Farm API listening on %s", server.Addr); errCh <- server.ListenAndServe() }()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	select {
	case <-stop:
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
}
