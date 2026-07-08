package main

import (
	"log"
	"net/http"
	"os"
	"splitcheck/backend/internal/room"
	"splitcheck/backend/internal/store"
)

func main() {
	memoryStore := store.NewMemoryStore()
	roomHandler := room.NewHandler(memoryStore)

	mux := http.NewServeMux()
	mux.Handle("/rooms", roomHandler)
	mux.Handle("/rooms/", roomHandler)

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	addr := ":8080"
	log.Println("Starting server on", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func createStore() store.Store {
	databaseURL := os.Getenv("DATABASE_URL")

	if databaseURL == "" {
		log.Println("DATABASE_URL is empty. Using in-memory store")
		return store.NewMemoryStore()
	}

	postgresStore, err := store.NewPostgresStore(nil, databaseURL)
	if err != nil {
		log.Fatal("failed to connect to postgres:", err)
	}

	log.Println("Connected to PostgreSQL")

	return postgresStore
}
