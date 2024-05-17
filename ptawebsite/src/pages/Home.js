import supabase from "../config/supabaseClient"
import { useEffect, useState } from 'react'

import UserCard from "../components/UserCard"

const Home = () => {

  const[fetchError, setFetchError] = useState(null)
  const[users, setUsers] = useState(null)

  useEffect(() => {
    const fetchUsers = async () => {
      const {data, error} = await supabase
        .from('users')
        .select()

        if(error){
          setFetchError("could not fetch users")
          setUsers(null)
          console.log(error)
        }
        if (data){
          setUsers(data)
          setFetchError(null)
        }
    }

    fetchUsers()
  },[])

  return (
    <div className="page home">
      {fetchError && (<p>{fetchError}</p>)}
      {users && (
        <div className="users">
          {/* order-by buttons */}
          <div className="user-grid">
            {users.map(user => (
              <UserCard key={user.id} user={user}/>
            ))}
          </div>  
        </div>
      )}
    </div>
  )
}

export default Home